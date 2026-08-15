import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
} from "@/db/schema";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { lockCanteenMenuMutationForSource } from "./canteen-menu-mutation-lock";
import {
  evaluateMenuSnapshot,
  resolveApprovedIdentityTransitionBlocking,
  type MenuSnapshotEvaluation,
} from "./canteen-menu-snapshot-evaluator";
import {
  fingerprintMenuIdentityTransitionSource,
  verifyMenuIdentityTransitionArtifact,
} from "./canteen-menu-identity-transition";
import type { ExistingSyncMenuItem } from "./canteen-menu-sync";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncInput,
} from "./canteen-types";
import {
  finalizeLockedClaimedRun,
  lockMenuSourceClaim,
  type MenuSourceClaim,
} from "./canteen-menu-source-sync-runtime";
import { assertProviderSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";

type MenuSourceRow = typeof canteenMenuSources.$inferSelect;

type RecurringSyncCompletion = {
  claim: MenuSourceClaim;
  snapshotHash: string;
  itemCount: number;
};

type RecurringMenuSyncCommit = {
  status: "applied" | "unchanged" | "blocked";
  evaluation: MenuSnapshotEvaluation;
};

type SyncMenuRow = {
  id: string;
  name: string;
  mealPeriods: string[];
  sortOrder: number;
  svgKey: string;
  legacyPrice: number | null;
  menuSourceId: string | null;
  externalProductId: string | null;
  isAvailable: boolean;
  priceId: string | null;
  priceLabel: string | null;
  amountMinor: number | null;
  currency: string | null;
  priceSortOrder: number | null;
};

function priceOptionValues(
  menuItemId: string,
  options: MenuItemPriceOptionInput[],
  now: Date,
) {
  return options.map((option) => ({
    menuItemId,
    ...option,
    createdAt: now,
    updatedAt: now,
  }));
}

function collectExistingSyncItems(rows: SyncMenuRow[]): ExistingSyncMenuItem[] {
  const items = new Map<string, ExistingSyncMenuItem>();
  for (const row of rows) {
    const existing = items.get(row.id);
    if (existing) {
      if (row.priceId) {
        existing.priceOptions.push({
          label: row.priceLabel,
          amountMinor: row.amountMinor!,
          currency: row.currency!,
          sortOrder: row.priceSortOrder!,
        });
      }
      continue;
    }
    items.set(row.id, {
      id: row.id,
      name: row.name,
      mealPeriods: row.mealPeriods as MealPeriodAssignment[],
      sortOrder: row.sortOrder,
      svgKey: row.svgKey,
      priceOptions: row.priceId
        ? [
            {
              label: row.priceLabel,
              amountMinor: row.amountMinor!,
              currency: row.currency!,
              sortOrder: row.priceSortOrder!,
            },
          ]
        : row.legacyPrice == null
          ? []
          : [
              {
                label: null,
                amountMinor: row.legacyPrice * 100,
                currency: "HKD",
                sortOrder: 0,
              },
            ],
      menuSourceId: row.menuSourceId,
      externalProductId: row.externalProductId,
      isAvailable: row.isAvailable,
    });
  }
  for (const item of items.values()) {
    item.priceOptions.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return [...items.values()];
}

function syncMenuSelection() {
  return {
    id: canteenMenuItems.id,
    name: canteenMenuItems.name,
    mealPeriods: canteenMenuItems.mealPeriods,
    sortOrder: canteenMenuItems.sortOrder,
    svgKey: canteenMenuItems.svgKey,
    legacyPrice: canteenMenuItems.price,
    menuSourceId: canteenMenuItems.menuSourceId,
    externalProductId: canteenMenuItems.externalProductId,
    isAvailable: canteenMenuItems.isAvailable,
    priceId: canteenMenuItemPrices.id,
    priceLabel: canteenMenuItemPrices.label,
    amountMinor: canteenMenuItemPrices.amountMinor,
    currency: canteenMenuItemPrices.currency,
    priceSortOrder: canteenMenuItemPrices.sortOrder,
  };
}

export type MenuSyncPreview = MenuSnapshotEvaluation & {
  previewToken: string;
};

function createMenuSyncPreviewToken(
  source: MenuSourceRow,
  input: MenuSyncInput,
  existing: ExistingSyncMenuItem[],
): string {
  const normalizedExisting = [...existing]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      ...item,
      priceOptions: [...item.priceOptions].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          (a.label ?? "").localeCompare(b.label ?? "") ||
          a.currency.localeCompare(b.currency) ||
          a.amountMinor - b.amountMinor,
      ),
    }));
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceId: source.id,
        canteenId: source.canteenId,
        legacyTakeoverAt: source.legacyTakeoverAt,
        input,
        existing: normalizedExisting,
      }),
    )
    .digest("hex");
}

async function selectExistingItems(
  executor: Pick<typeof db, "select">,
  canteenId: string,
) {
  return executor
    .select(syncMenuSelection())
    .from(canteenMenuItems)
    .leftJoin(
      canteenMenuItemPrices,
      eq(canteenMenuItemPrices.menuItemId, canteenMenuItems.id),
    )
    .where(eq(canteenMenuItems.canteenId, canteenId))
    .orderBy(canteenMenuItems.id);
}

async function lockExistingMenuItems(
  executor: Pick<typeof db, "select">,
  canteenId: string,
): Promise<void> {
  await executor
    .select({ id: canteenMenuItems.id })
    .from(canteenMenuItems)
    .where(eq(canteenMenuItems.canteenId, canteenId))
    .orderBy(canteenMenuItems.id)
    .for("update", { of: canteenMenuItems });
}

export async function previewMenuSync(
  sourceId: string,
  input: MenuSyncInput,
): Promise<MenuSyncPreview> {
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.id, sourceId),
  });
  if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");
  assertProviderSnapshotCompleteness(
    source.provider,
    input.snapshotCompleteness,
  );
  if (input.takeOverLegacyItems && source.legacyTakeoverAt !== null) {
    throw new Error("LEGACY_TAKEOVER_ALREADY_COMPLETED");
  }
  const existing = collectExistingSyncItems(
    await selectExistingItems(db, source.canteenId),
  );
  const evaluation = evaluateMenuSnapshot(
    {
      id: source.id,
      provider: source.provider,
      legacyAdoptionOpen: source.legacyTakeoverAt === null,
    },
    input,
    existing,
  );
  return {
    ...evaluation,
    previewToken: createMenuSyncPreviewToken(
      source,
      evaluation.canonicalState.input,
      evaluation.canonicalState.existingItems,
    ),
  };
}

type MenuSyncApplyMode =
  | { kind: "legacy"; sourceId: string }
  | { kind: "recurring"; completion: RecurringSyncCompletion }
  | { kind: "identity-transition"; sourceId: string; artifact: unknown };

async function applyMenuSync(
  mode: { kind: "legacy"; sourceId: string },
  input: MenuSyncInput,
  expectedPreviewToken: unknown,
): Promise<MenuSnapshotEvaluation>;
async function applyMenuSync(
  mode: { kind: "recurring"; completion: RecurringSyncCompletion },
  input: MenuSyncInput,
  expectedPreviewToken: unknown,
): Promise<RecurringMenuSyncCommit>;
async function applyMenuSync(
  mode: { kind: "identity-transition"; sourceId: string; artifact: unknown },
  input: MenuSyncInput,
): Promise<MenuSnapshotEvaluation>;

async function applyMenuSync(
  mode: MenuSyncApplyMode,
  input: MenuSyncInput,
  expectedPreviewToken?: unknown,
): Promise<MenuSnapshotEvaluation | RecurringMenuSyncCommit> {
  const evaluationResult = await db.transaction(async (tx) => {
    // Every menu writer locks canteen -> source -> existing items. The parent
    // lock covers inserts, while the fixed order avoids delete-cascade deadlocks.
    const sourceId =
      mode.kind === "recurring"
        ? mode.completion.claim.source.id
        : mode.sourceId;
    const lockedCanteenId = await lockCanteenMenuMutationForSource(
      tx,
      sourceId,
    );
    if (!lockedCanteenId) {
      throw new Error(
        mode.kind === "recurring"
          ? "MENU_SYNC_SUPERSEDED"
          : "MENU_SOURCE_NOT_FOUND",
      );
    }
    const source =
      mode.kind === "recurring"
        ? await lockMenuSourceClaim(tx, mode.completion.claim)
        : (
            await tx
              .select({
                ...getTableColumns(canteenMenuSources),
                databaseNow: sql<Date>`now()`.mapWith(
                  canteenMenuSources.updatedAt,
                ),
                claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
              })
              .from(canteenMenuSources)
              .where(eq(canteenMenuSources.id, mode.sourceId))
              .for("update", { of: canteenMenuSources })
          )[0];
    const recurring = mode.kind === "recurring" ? mode.completion : null;
    if (!source) {
      throw new Error(
        mode.kind === "recurring"
          ? "MENU_SYNC_SUPERSEDED"
          : "MENU_SOURCE_NOT_FOUND",
      );
    }
    if (source.canteenId !== lockedCanteenId) {
      throw new Error(
        mode.kind === "recurring" ? "MENU_SYNC_SUPERSEDED" : "MENU_SYNC_STALE",
      );
    }
    assertProviderSnapshotCompleteness(
      source.provider,
      input.snapshotCompleteness,
    );
    const now = source.databaseNow;
    if (input.takeOverLegacyItems && source.legacyTakeoverAt !== null) {
      throw new Error("LEGACY_TAKEOVER_ALREADY_COMPLETED");
    }
    if (mode.kind === "identity-transition" && input.takeOverLegacyItems) {
      throw new Error("IDENTITY_TRANSITION_LEGACY_TAKEOVER_FORBIDDEN");
    }

    await lockExistingMenuItems(tx, source.canteenId);
    const rows = await selectExistingItems(tx, source.canteenId);
    const existing = collectExistingSyncItems(rows);
    const baselineEvaluation = evaluateMenuSnapshot(
      {
        id: source.id,
        provider: source.provider,
        legacyAdoptionOpen: source.legacyTakeoverAt === null,
      },
      input,
      existing,
    );
    let evaluation = baselineEvaluation;
    if (mode.kind === "identity-transition") {
      if (
        !baselineEvaluation.blockingReasons.some(
          (reason) => reason.code === "MENU_SYNC_IDENTITY_CHURN",
        )
      ) {
        throw new Error("MENU_IDENTITY_TRANSITION_NOT_APPLICABLE");
      }
      const approvedReplacements = verifyMenuIdentityTransitionArtifact(
        {
          provider: source.provider,
          externalOwnerId: source.externalOwnerId,
          externalStoreId: source.externalStoreId,
          configurationFingerprint:
            fingerprintMenuIdentityTransitionSource(source),
        },
        baselineEvaluation.canonicalState.existingItems.filter(
          (item) => item.menuSourceId === source.id,
        ),
        baselineEvaluation.canonicalState.input,
        mode.artifact,
      );
      evaluation = evaluateMenuSnapshot(
        {
          id: source.id,
          provider: source.provider,
          legacyAdoptionOpen: source.legacyTakeoverAt === null,
        },
        baselineEvaluation.canonicalState.input,
        baselineEvaluation.canonicalState.existingItems,
        approvedReplacements,
      );
      evaluation = resolveApprovedIdentityTransitionBlocking(evaluation);
    } else {
      if (
        typeof expectedPreviewToken !== "string" ||
        !expectedPreviewToken ||
        expectedPreviewToken !==
          createMenuSyncPreviewToken(
            source,
            evaluation.canonicalState.input,
            evaluation.canonicalState.existingItems,
          )
      ) {
        throw new Error("MENU_SYNC_STALE");
      }
    }
    const currentPlan = evaluation.plan;
    if (evaluation.blockingDecision.blocked) {
      if (recurring) {
        const code = evaluation.blockingDecision.code;
        await finalizeLockedClaimedRun(tx, source, recurring.claim, {
          kind: "error",
          code,
          message: code,
          snapshotHash: recurring.snapshotHash,
          itemCount: recurring.itemCount,
          observation: evaluation.identityObservation,
        });
        return { status: "blocked" as const, evaluation };
      }
      throw Object.assign(new Error(evaluation.blockingDecision.code), {
        evaluation,
        observation: evaluation.identityObservation,
        blockingDecision: evaluation.blockingDecision,
      });
    }

    const actionByProduct = new Map(
      currentPlan.actions.map((action) => [action.externalProductId, action]),
    );
    const existingByProduct = new Map(
      evaluation.canonicalState.existingItems
        .filter(
          (item) =>
            item.menuSourceId === source.id && item.externalProductId !== null,
        )
        .map((item) => [item.externalProductId!, item]),
    );
    for (const item of evaluation.canonicalState.input.items) {
      const action = actionByProduct.get(item.externalProductId);
      if (action?.action === "create") {
        const [created] = await tx
          .insert(canteenMenuItems)
          .values({
            canteenId: source.canteenId,
            name: item.name,
            price: null,
            mealPeriods: item.mealPeriods,
            sortOrder: item.sortOrder,
            svgKey: item.svgKey,
            menuSourceId: source.id,
            externalProductId: item.externalProductId,
            isAvailable: true,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: canteenMenuItems.id });
        if (item.priceOptions.length > 0) {
          await tx
            .insert(canteenMenuItemPrices)
            .values(priceOptionValues(created.id, item.priceOptions, now));
        }
        continue;
      }

      const itemId =
        action?.itemId ?? existingByProduct.get(item.externalProductId)?.id;
      if (!itemId) throw new Error("MENU_SYNC_STALE");
      await tx
        .update(canteenMenuItems)
        .set({
          name: item.name,
          price: null,
          mealPeriods: item.mealPeriods,
          sortOrder: item.sortOrder,
          svgKey: item.svgKey,
          menuSourceId: source.id,
          externalProductId: item.externalProductId,
          isAvailable: true,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(canteenMenuItems.id, itemId),
            eq(canteenMenuItems.canteenId, source.canteenId),
          ),
        );
      if (action) {
        await tx
          .delete(canteenMenuItemPrices)
          .where(eq(canteenMenuItemPrices.menuItemId, itemId));
        if (item.priceOptions.length > 0) {
          await tx
            .insert(canteenMenuItemPrices)
            .values(priceOptionValues(itemId, item.priceOptions, now));
        }
      }
    }

    for (const action of currentPlan.actions) {
      if (action.action !== "deactivate" || !action.itemId) continue;
      await tx
        .update(canteenMenuItems)
        .set({ isAvailable: false, lastSyncedAt: now, updatedAt: now })
        .where(
          and(
            eq(canteenMenuItems.id, action.itemId),
            eq(canteenMenuItems.canteenId, source.canteenId),
          ),
        );
    }
    if (input.takeOverLegacyItems) {
      await tx
        .update(canteenMenuSources)
        .set({ legacyTakeoverAt: now, enabled: true, updatedAt: now })
        .where(eq(canteenMenuSources.id, source.id));
    }
    if (recurring) {
      const status: "applied" | "unchanged" =
        currentPlan.actions.length === 0 ? "unchanged" : "applied";
      await finalizeLockedClaimedRun(tx, source, recurring.claim, {
        kind: "success",
        status,
        snapshotHash: recurring.snapshotHash,
        itemCount: recurring.itemCount,
        createdCount: currentPlan.actions.filter(
          (action) => action.action === "create",
        ).length,
        updatedCount: currentPlan.actions.filter((action) =>
          ["update", "reactivate", "claim"].includes(action.action),
        ).length,
        deactivatedCount: currentPlan.actions.filter(
          (action) => action.action === "deactivate",
        ).length,
        observation: evaluation.identityObservation,
      });
      return { status, evaluation };
    }
    return evaluation;
  });

  if (mode.kind !== "recurring") {
    const source = await db.query.canteenMenuSources.findFirst({
      where: eq(canteenMenuSources.id, mode.sourceId),
      columns: { canteenId: true },
    });
    if (source) {
      revalidatePath(`/admin/canteens/${source.canteenId}`);
      revalidatePath(`/api/canteens/${source.canteenId}/menu`);
      revalidatePath(`/canteen/${source.canteenId}`);
    }
  }
  return evaluationResult;
}

export function applyPreviewedMenuSync(
  sourceId: string,
  input: MenuSyncInput,
  previewToken: unknown,
): Promise<MenuSnapshotEvaluation> {
  return applyMenuSync({ kind: "legacy", sourceId }, input, previewToken);
}

export function applyApprovedMenuIdentityTransition(
  sourceId: string,
  input: MenuSyncInput,
  artifact: unknown,
): Promise<MenuSnapshotEvaluation> {
  return applyMenuSync(
    { kind: "identity-transition", sourceId, artifact },
    input,
  );
}

export function commitClaimedRecurringMenuSync(
  input: MenuSyncInput,
  previewToken: unknown,
  completion: RecurringSyncCompletion,
): Promise<RecurringMenuSyncCommit> {
  if (input.takeOverLegacyItems) {
    return Promise.reject(new Error("AUTOMATED_LEGACY_TAKEOVER_FORBIDDEN"));
  }
  return applyMenuSync({ kind: "recurring", completion }, input, previewToken);
}
