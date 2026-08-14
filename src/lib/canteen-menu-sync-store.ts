import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
} from "@/db/schema";
import { and, eq, getTableColumns, inArray, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createMenuExternalKey } from "@/lib/canteen-menu-external-key";
import {
  evaluateMenuSnapshot,
  type MenuSnapshotEvaluation,
} from "./canteen-menu-snapshot-evaluator";
import type { ExistingSyncMenuItem } from "./canteen-menu-sync";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncInput,
} from "@/lib/canteen-types";
import { fetchMenuFromProvider } from "./canteen-menu-source-adapters";
import { normalizeSyncErrorCode } from "./sync-error-code";

type MenuSourceRow = typeof canteenMenuSources.$inferSelect;

const MAX_ERROR_LENGTH = 1_000;
const MAX_CONCURRENCY = 2;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const CLAIM_DURATION_MS = 2 * 60 * 1_000;

declare const normalizedSyncCode: unique symbol;
type NormalizedSyncCode = string & { readonly [normalizedSyncCode]: true };

type MenuSourceSyncResultBase = {
  sourceId: string;
  canteenId?: string;
  runId?: string;
};

export type MenuSourceSyncResult = MenuSourceSyncResultBase &
  (
    | {
        status: "applied";
        code: "MENU_SYNC_APPLIED";
        itemCount: number;
      }
    | {
        status: "unchanged";
        code: "MENU_SYNC_UNCHANGED";
        itemCount: number;
      }
    | {
        status: "already-running";
        code: "MENU_SYNC_ALREADY_RUNNING";
      }
    | {
        status: "blocked";
        code:
          | "MENU_SYNC_CONFLICT"
          | "MENU_SYNC_IDENTITY_CHURN"
          | "MENU_SYNC_SUSPICIOUS_DROP";
      }
    | { status: "provider-failure"; code: NormalizedSyncCode }
    | {
        status: "source-unavailable";
        code: "MENU_SOURCE_NOT_FOUND" | "MENU_SOURCE_DISABLED";
      }
    | { status: "internal-failure"; code: NormalizedSyncCode }
    | { status: "superseded"; code: "MENU_SYNC_SUPERSEDED" }
  );

export function isMenuSourceSyncFailure(result: MenuSourceSyncResult): boolean {
  return [
    "blocked",
    "provider-failure",
    "source-unavailable",
    "internal-failure",
    "superseded",
  ].includes(result.status);
}

type RecurringSyncCompletion = {
  runId: string;
  snapshotHash: string;
  itemCount: number;
  sourceFingerprint: string;
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
    .where(eq(canteenMenuItems.canteenId, canteenId));
}

export async function previewMenuSync(
  sourceId: string,
  input: MenuSyncInput,
): Promise<MenuSyncPreview> {
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.id, sourceId),
  });
  if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");
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

function shadowSourceNamespace(source: MenuSourceRow): string {
  if (source.provider !== "qmai") {
    return `${source.provider}:${source.externalStoreId}`;
  }
  const sellerId = source.externalOwnerId;
  if (!sellerId?.trim()) {
    throw new Error("INVALID_MENU_SOURCE_CONFIG");
  }
  return `qmai:${sellerId.trim()}:${source.externalStoreId}`;
}

function menuSourceFingerprint(source: MenuSourceRow): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: source.id,
        canteenId: source.canteenId,
        provider: source.provider,
        externalOwnerId: source.externalOwnerId,
        externalStoreId: source.externalStoreId,
        config: source.config,
        enabled: source.enabled,
      }),
    )
    .digest("hex");
}

type MenuSyncApplyMode =
  | { kind: "legacy"; sourceId: string }
  | { kind: "recurring"; completion: RecurringSyncCompletion };

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
  mode: MenuSyncApplyMode,
  input: MenuSyncInput,
  expectedPreviewToken: unknown,
): Promise<MenuSnapshotEvaluation | RecurringMenuSyncCommit> {
  const recurring = mode.kind === "recurring" ? mode.completion : null;
  const evaluationResult = await db.transaction(async (tx) => {
    // Lock the source first. This serializes even the very first sync, when no
    // managed menu rows exist yet, and fixes source/canteen ownership in DB.
    const [source] = await tx
      .select({
        ...getTableColumns(canteenMenuSources),
        databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
        claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
      })
      .from(canteenMenuSources)
      .where(
        mode.kind === "recurring"
          ? eq(canteenMenuSources.syncClaimToken, mode.completion.runId)
          : eq(canteenMenuSources.id, mode.sourceId),
      )
      .for("update", { of: canteenMenuSources });
    if (!source) {
      throw new Error(
        mode.kind === "recurring"
          ? "MENU_SYNC_SUPERSEDED"
          : "MENU_SOURCE_NOT_FOUND",
      );
    }
    if (
      recurring &&
      (source.syncClaimToken !== recurring.runId ||
        source.claimExpired ||
        menuSourceFingerprint(source) !== recurring.sourceFingerprint)
    ) {
      throw new Error("MENU_SYNC_SUPERSEDED");
    }
    const now = source.databaseNow;
    if (input.takeOverLegacyItems && source.legacyTakeoverAt !== null) {
      throw new Error("LEGACY_TAKEOVER_ALREADY_COMPLETED");
    }

    const rows = await selectExistingItems(tx, source.canteenId);
    const existing = collectExistingSyncItems(rows);
    const evaluation = evaluateMenuSnapshot(
      {
        id: source.id,
        provider: source.provider,
        legacyAdoptionOpen: source.legacyTakeoverAt === null,
      },
      input,
      existing,
    );
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
    const currentPlan = evaluation.plan;
    if (evaluation.blockingDecision.blocked) {
      if (recurring) {
        const code = evaluation.blockingDecision.code;
        const [updatedSource] = await tx
          .update(canteenMenuSources)
          .set({
            observedState: "error",
            lastErrorCode: code,
            lastError: code,
            syncClaimToken: null,
            syncClaimExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(canteenMenuSources.id, source.id),
              eq(canteenMenuSources.syncClaimToken, recurring.runId),
            ),
          )
          .returning({ id: canteenMenuSources.id });
        const [updatedRun] = await tx
          .update(canteenMenuSyncRuns)
          .set({
            status: "failed",
            snapshotHash: recurring.snapshotHash,
            itemCount: recurring.itemCount,
            observation: evaluation.identityObservation,
            errorCode: code,
            error: code,
            completedAt: now,
          })
          .where(
            and(
              eq(canteenMenuSyncRuns.id, recurring.runId),
              eq(canteenMenuSyncRuns.status, "running"),
            ),
          )
          .returning({ id: canteenMenuSyncRuns.id });
        if (!updatedSource || !updatedRun) {
          throw new Error("MENU_SYNC_SUPERSEDED");
        }
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
    const shadowSource = shadowSourceNamespace(source);

    for (const item of evaluation.canonicalState.input.items) {
      const action = actionByProduct.get(item.externalProductId);
      const shadowKey = createMenuExternalKey(
        item.externalProductId,
        item.mealPeriods,
      );
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
            externalSource: shadowSource,
            externalKey: shadowKey,
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
          externalSource: shadowSource,
          externalKey: shadowKey,
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
      const [updatedSource] = await tx
        .update(canteenMenuSources)
        .set({
          lastSuccessAt: now,
          lastSnapshotHash: recurring.snapshotHash,
          observedState: "available",
          lastErrorCode: null,
          lastError: null,
          syncClaimToken: null,
          syncClaimExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(canteenMenuSources.id, source.id),
            eq(canteenMenuSources.syncClaimToken, recurring.runId),
          ),
        )
        .returning({ id: canteenMenuSources.id });
      const [updatedRun] = await tx
        .update(canteenMenuSyncRuns)
        .set({
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
          completedAt: now,
        })
        .where(
          and(
            eq(canteenMenuSyncRuns.id, recurring.runId),
            eq(canteenMenuSyncRuns.status, "running"),
          ),
        )
        .returning({ id: canteenMenuSyncRuns.id });
      if (!updatedSource || !updatedRun) {
        throw new Error("MENU_SYNC_SUPERSEDED");
      }
      return { status, evaluation };
    }
    return evaluation;
  });

  if (mode.kind === "legacy") {
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

function commitClaimedRecurringMenuSync(
  input: MenuSyncInput,
  previewToken: unknown,
  completion: RecurringSyncCompletion,
): Promise<RecurringMenuSyncCommit> {
  if (input.takeOverLegacyItems) {
    return Promise.reject(new Error("AUTOMATED_LEGACY_TAKEOVER_FORBIDDEN"));
  }
  return applyMenuSync({ kind: "recurring", completion }, input, previewToken);
}

type ClaimedSource = typeof canteenMenuSources.$inferSelect;

async function acquireSourceClaim(sourceId: string): Promise<
  | { status: "claimed"; source: ClaimedSource; runId: string }
  | { status: "already-running"; runId: string; canteenId: string }
  | {
      status: "unavailable";
      code: "MENU_SOURCE_NOT_FOUND" | "MENU_SOURCE_DISABLED";
    }
> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        ...getTableColumns(canteenMenuSources),
        databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId))
      .for("update", { of: canteenMenuSources });
    if (!source) {
      return { status: "unavailable", code: "MENU_SOURCE_NOT_FOUND" };
    }
    if (!source.enabled) {
      return { status: "unavailable", code: "MENU_SOURCE_DISABLED" };
    }
    const now = source.databaseNow;
    if (
      source.syncClaimToken &&
      source.syncClaimExpiresAt &&
      source.syncClaimExpiresAt > now
    ) {
      return {
        status: "already-running",
        runId: source.syncClaimToken,
        canteenId: source.canteenId,
      };
    }

    const runId = randomUUID();
    if (source.syncClaimToken) {
      await tx
        .update(canteenMenuSyncRuns)
        .set({
          status: "failed",
          errorCode: "MENU_SYNC_SUPERSEDED",
          error: "MENU_SYNC_SUPERSEDED",
          completedAt: now,
        })
        .where(
          and(
            eq(canteenMenuSyncRuns.id, source.syncClaimToken),
            eq(canteenMenuSyncRuns.status, "running"),
          ),
        );
    }
    await tx
      .delete(canteenMenuSyncRuns)
      .where(
        and(
          eq(canteenMenuSyncRuns.menuSourceId, source.id),
          inArray(
            canteenMenuSyncRuns.status,
            CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
          ),
          lt(
            canteenMenuSyncRuns.startedAt,
            new Date(now.getTime() - RUN_RETENTION_MS),
          ),
        ),
      );
    const [claimedSource] = await tx
      .update(canteenMenuSources)
      .set({
        lastAttemptId: runId,
        lastAttemptAt: now,
        syncClaimToken: runId,
        syncClaimExpiresAt: new Date(now.getTime() + CLAIM_DURATION_MS),
        updatedAt: now,
      })
      .where(eq(canteenMenuSources.id, source.id))
      .returning();
    await tx.insert(canteenMenuSyncRuns).values({
      id: runId,
      menuSourceId: source.id,
      startedAt: now,
    });
    return { status: "claimed", source: claimedSource, runId };
  });
}

function snapshotHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN_SYNC_ERROR";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function errorCode(error: unknown): NormalizedSyncCode {
  return normalizeSyncErrorCode(
    error instanceof Error ? error.message : null,
  ) as NormalizedSyncCode;
}

async function finishClaimedFailure(
  source: ClaimedSource,
  runId: string,
  details: {
    code: string;
    message: string;
    snapshotHash?: string;
    itemCount?: number;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        ...getTableColumns(canteenMenuSources),
        claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
        databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, source.id))
      .for("update", { of: canteenMenuSources });
    if (
      !locked ||
      locked.syncClaimToken !== runId ||
      locked.claimExpired ||
      menuSourceFingerprint(locked) !== menuSourceFingerprint(source)
    ) {
      return false;
    }
    const [updatedSource] = await tx
      .update(canteenMenuSources)
      .set({
        observedState: "error",
        lastErrorCode: details.code,
        lastError: details.message,
        syncClaimToken: null,
        syncClaimExpiresAt: null,
        updatedAt: locked.databaseNow,
      })
      .where(
        and(
          eq(canteenMenuSources.id, source.id),
          eq(canteenMenuSources.syncClaimToken, runId),
        ),
      )
      .returning({ id: canteenMenuSources.id });
    const [updatedRun] = await tx
      .update(canteenMenuSyncRuns)
      .set({
        status: "failed",
        snapshotHash: details.snapshotHash,
        itemCount: details.itemCount,
        observation: {},
        errorCode: details.code,
        error: details.message,
        completedAt: locked.databaseNow,
      })
      .where(
        and(
          eq(canteenMenuSyncRuns.id, runId),
          eq(canteenMenuSyncRuns.status, "running"),
        ),
      )
      .returning({ id: canteenMenuSyncRuns.id });
    if (!updatedSource || !updatedRun) {
      throw new Error("MENU_SYNC_FINALIZATION_INCONSISTENT");
    }
    return true;
  });
}

function supersededResult(
  source: ClaimedSource,
  runId: string,
): MenuSourceSyncResult {
  return {
    sourceId: source.id,
    canteenId: source.canteenId,
    runId,
    status: "superseded",
    code: "MENU_SYNC_SUPERSEDED",
  };
}

async function finishClaimedSuperseded(
  sourceId: string,
  runId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        claimToken: canteenMenuSources.syncClaimToken,
        databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId))
      .for("update", { of: canteenMenuSources });
    if (!locked || locked.claimToken !== runId) return;
    await tx
      .update(canteenMenuSources)
      .set({
        syncClaimToken: null,
        syncClaimExpiresAt: null,
        updatedAt: locked.databaseNow,
      })
      .where(
        and(
          eq(canteenMenuSources.id, sourceId),
          eq(canteenMenuSources.syncClaimToken, runId),
        ),
      );
    await tx
      .update(canteenMenuSyncRuns)
      .set({
        status: "failed",
        errorCode: "MENU_SYNC_SUPERSEDED",
        error: "MENU_SYNC_SUPERSEDED",
        completedAt: locked.databaseNow,
      })
      .where(
        and(
          eq(canteenMenuSyncRuns.id, runId),
          eq(canteenMenuSyncRuns.status, "running"),
        ),
      );
  });
}

async function finalizeFailureResult(
  source: ClaimedSource,
  runId: string,
  error: unknown,
  status: "provider-failure" | "internal-failure",
  snapshot?: { hash: string; itemCount: number },
): Promise<MenuSourceSyncResult> {
  const code = errorCode(error);
  if (code === "MENU_SYNC_SUPERSEDED") {
    await finishClaimedSuperseded(source.id, runId);
    return supersededResult(source, runId);
  }
  const finalized = await finishClaimedFailure(source, runId, {
    code,
    message: safeError(error),
    snapshotHash: snapshot?.hash,
    itemCount: snapshot?.itemCount,
  });
  if (!finalized) {
    await finishClaimedSuperseded(source.id, runId);
    return supersededResult(source, runId);
  }
  return {
    sourceId: source.id,
    canteenId: source.canteenId,
    runId,
    status,
    code,
  };
}

/** Sync one source by stable DB identity; callers never supply provider data. */
export async function syncCanteenMenuSource(
  sourceId: string,
): Promise<MenuSourceSyncResult> {
  const claim = await acquireSourceClaim(sourceId);
  if (claim.status === "unavailable") {
    return {
      sourceId,
      status: "source-unavailable",
      code: claim.code,
    };
  }
  if (claim.status === "already-running") {
    return {
      sourceId,
      canteenId: claim.canteenId,
      runId: claim.runId,
      status: "already-running",
      code: "MENU_SYNC_ALREADY_RUNNING",
    };
  }
  const { source, runId } = claim;

  let input: MenuSyncInput;
  try {
    const fetched = await fetchMenuFromProvider(source);
    input = { ...fetched, takeOverLegacyItems: false };
    if (input.items.length === 0) throw new Error("EMPTY_MENU_SYNC");
  } catch (error) {
    return finalizeFailureResult(source, runId, error, "provider-failure");
  }

  const snapshot = {
    hash: snapshotHash(input),
    itemCount: input.items.length,
  };
  try {
    const { previewToken } = await previewMenuSync(source.id, input);
    const committed = await commitClaimedRecurringMenuSync(
      input,
      previewToken,
      {
        runId,
        snapshotHash: snapshot.hash,
        itemCount: snapshot.itemCount,
        sourceFingerprint: menuSourceFingerprint(source),
      },
    );
    if (committed.status === "blocked") {
      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        runId,
        status: "blocked",
        code: committed.evaluation.blockingDecision.code!,
      };
    }
    return committed.status === "applied"
      ? {
          sourceId: source.id,
          canteenId: source.canteenId,
          runId,
          status: "applied",
          code: "MENU_SYNC_APPLIED",
          itemCount: input.items.length,
        }
      : {
          sourceId: source.id,
          canteenId: source.canteenId,
          runId,
          status: "unchanged",
          code: "MENU_SYNC_UNCHANGED",
          itemCount: input.items.length,
        };
  } catch (error) {
    return finalizeFailureResult(
      source,
      runId,
      error,
      "internal-failure",
      snapshot,
    );
  }
}

export async function syncEnabledCanteenMenuSources(): Promise<
  MenuSourceSyncResult[]
> {
  const sources = await db.query.canteenMenuSources.findMany({
    where: eq(canteenMenuSources.enabled, true),
    columns: { id: true },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  const results: MenuSourceSyncResult[] = [];
  for (let index = 0; index < sources.length; index += MAX_CONCURRENCY) {
    results.push(
      ...(await Promise.all(
        sources
          .slice(index, index + MAX_CONCURRENCY)
          .map(async (source) => syncCanteenMenuSource(source.id)),
      )),
    );
  }
  return results;
}
