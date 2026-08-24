import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
} from "@/db/schema";
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { lockCanteenMenuMutationForSource } from "./canteen-menu-mutation-lock";
import {
  evaluateCurrentMenuProjection,
  evaluateMenuIdentityTransitionSnapshot,
  evaluateMenuSnapshot,
  resolveApprovedIdentityTransitionBlocking,
  type MenuSnapshotEvaluation,
} from "./canteen-menu-snapshot-evaluator";
import {
  assertLegacyIdentityTransitionSnapshot,
  buildMenuIdentityTransitionAudit,
  fingerprintMenuIdentityTransitionSource,
  type ApprovedMenuIdentityCanonicalization,
  type ApprovedMenuIdentityMerge,
  type MenuIdentityTransitionArtifact,
  type MenuIdentityTransitionSourceConfiguration,
  verifyMenuIdentityTransitionApproval,
} from "./canteen-menu-identity-transition";
import type { ExistingSyncMenuItem } from "./canteen-menu-sync";
import type {
  CurrentMenuProjection,
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncInput,
} from "./canteen-types";
import { assertProviderSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";

type MenuSourceRow = typeof canteenMenuSources.$inferSelect;
export type MenuSyncTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type LockedMenuSource = MenuSourceRow & {
  databaseNow: Date;
  claimExpired: boolean;
};
export type RecurringMenuProjection = {
  status: "applied" | "unchanged" | "blocked";
  evaluation: MenuSnapshotEvaluation<CurrentMenuProjection>;
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
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

function projectApprovedIdentityChanges(
  existingItems: readonly ExistingSyncMenuItem[],
  canonicalizations: readonly ApprovedMenuIdentityCanonicalization[],
  merges: readonly ApprovedMenuIdentityMerge[],
): ExistingSyncMenuItem[] {
  const mergedIds = new Set(merges.flatMap((merge) => merge.mergedItemIds));
  const mergeBySurvivor = new Map(
    merges.map((merge) => [merge.survivorItemId, merge]),
  );
  const canonicalizationByItem = new Map(
    canonicalizations.map((item) => [item.itemId, item]),
  );
  return existingItems.flatMap((item) => {
    if (mergedIds.has(item.id)) return [];
    const merge = mergeBySurvivor.get(item.id);
    const canonicalization = canonicalizationByItem.get(item.id);
    return merge || canonicalization
      ? [
          {
            ...item,
            externalProductId:
              merge?.nextProductId ?? canonicalization!.nextProductId,
          },
        ]
      : [item];
  });
}

async function canonicalizeApprovedIdentities(
  tx: MenuSyncTransaction,
  canteenId: string,
  now: Date,
  canonicalizations: readonly ApprovedMenuIdentityCanonicalization[],
): Promise<void> {
  for (const canonicalization of canonicalizations) {
    await tx
      .update(canteenMenuItems)
      .set({
        externalProductId: canonicalization.nextProductId,
        updatedAt: now,
      })
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          eq(canteenMenuItems.id, canonicalization.itemId),
          eq(
            canteenMenuItems.externalProductId,
            canonicalization.previousProductId,
          ),
        ),
      );
  }
}

async function mergeApprovedIdentityHistory(
  tx: MenuSyncTransaction,
  canteenId: string,
  now: Date,
  merges: readonly ApprovedMenuIdentityMerge[],
): Promise<void> {
  for (const merge of merges) {
    const allItemIds = [merge.survivorItemId, ...merge.mergedItemIds];
    const votes = await tx
      .select({
        id: canteenDishVotes.id,
        menuItemId: canteenDishVotes.menuItemId,
        userId: canteenDishVotes.userId,
        anonymousSessionId: canteenDishVotes.anonymousSessionId,
        vote: canteenDishVotes.vote,
        createdAt: canteenDishVotes.createdAt,
      })
      .from(canteenDishVotes)
      .where(inArray(canteenDishVotes.menuItemId, allItemIds))
      .for("update", { of: canteenDishVotes });
    const votesByActor = new Map<string, typeof votes>();
    for (const vote of votes) {
      const actor = vote.userId
        ? `user:${vote.userId}`
        : `anonymous:${vote.anonymousSessionId}`;
      votesByActor.set(actor, [...(votesByActor.get(actor) ?? []), vote]);
    }
    const duplicateVoteIds: string[] = [];
    const votesToMove: string[] = [];
    for (const actorVotes of votesByActor.values()) {
      if (new Set(actorVotes.map((vote) => vote.vote)).size > 1) {
        throw new Error("MENU_IDENTITY_TRANSITION_VOTE_CONFLICT");
      }
      const ordered = actorVotes.toSorted(
        (left, right) =>
          Number(right.menuItemId === merge.survivorItemId) -
            Number(left.menuItemId === merge.survivorItemId) ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
      const [keeper, ...duplicates] = ordered;
      duplicateVoteIds.push(...duplicates.map((vote) => vote.id));
      if (keeper.menuItemId !== merge.survivorItemId) {
        votesToMove.push(keeper.id);
      }
    }
    if (duplicateVoteIds.length > 0) {
      await tx
        .delete(canteenDishVotes)
        .where(inArray(canteenDishVotes.id, duplicateVoteIds));
    }
    if (votesToMove.length > 0) {
      await tx
        .update(canteenDishVotes)
        .set({ menuItemId: merge.survivorItemId })
        .where(inArray(canteenDishVotes.id, votesToMove));
    }
    await tx
      .update(canteenDishComments)
      .set({ menuItemId: merge.survivorItemId })
      .where(inArray(canteenDishComments.menuItemId, merge.mergedItemIds));
    await tx
      .delete(canteenMenuItemPrices)
      .where(inArray(canteenMenuItemPrices.menuItemId, merge.mergedItemIds));
    await tx
      .update(canteenMenuItems)
      .set({
        menuSourceId: null,
        externalProductId: null,
        isAvailable: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          inArray(canteenMenuItems.id, merge.mergedItemIds),
        ),
      );
    await tx
      .update(canteenMenuItems)
      .set({
        externalProductId: merge.nextProductId,
        updatedAt: now,
      })
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          eq(canteenMenuItems.id, merge.survivorItemId),
        ),
      );
  }
}

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

function manualMenuProjection(input: MenuSyncInput): MenuSyncInput {
  return input.observationScope?.kind === "meal-period"
    ? { ...input, snapshotCompleteness: "partial" }
    : input;
}

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
    input.scopeEvidence,
    source.externalStoreId,
    input.observationScope,
  );
  if (input.takeOverLegacyItems && source.legacyTakeoverAt !== null) {
    throw new Error("LEGACY_TAKEOVER_ALREADY_COMPLETED");
  }
  const projectionInput = manualMenuProjection(input);
  const existing = collectExistingSyncItems(
    await selectExistingItems(db, source.canteenId),
  );
  const evaluation = evaluateMenuSnapshot(
    {
      id: source.id,
      provider: source.provider,
      legacyAdoptionOpen: source.legacyTakeoverAt === null,
    },
    projectionInput,
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

/** Build a read-only, fail-closed draft for one exact provider snapshot. */
export async function auditMenuIdentityTransition(
  source: MenuIdentityTransitionSourceConfiguration,
  input: MenuSyncInput,
): Promise<MenuIdentityTransitionArtifact> {
  assertProviderSnapshotCompleteness(
    source.provider,
    input.snapshotCompleteness,
    input.scopeEvidence,
    source.externalStoreId,
    input.observationScope,
  );
  const projectionInput = manualMenuProjection(input);
  const existing = collectExistingSyncItems(
    await selectExistingItems(db, source.canteenId),
  );
  const evaluation = evaluateMenuIdentityTransitionSnapshot(
    {
      id: source.id,
      provider: source.provider,
      legacyAdoptionOpen: source.legacyTakeoverAt === null,
    },
    projectionInput,
    existing,
  );
  const audit = buildMenuIdentityTransitionAudit(
    evaluation.canonicalState.existingItems.filter(
      (item) => item.menuSourceId === source.id,
    ),
    evaluation.canonicalState.input,
    source.provider,
  );
  if (
    !evaluation.blockingReasons.some(
      (reason) => reason.code === "MENU_SYNC_IDENTITY_CHURN",
    ) &&
    !(
      source.provider === "aigens" &&
      (audit.canonicalizationCandidates.length > 0 ||
        audit.mergeCandidates.length > 0)
    )
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_NOT_APPLICABLE");
  }
  return {
    schemaVersion: 5,
    source: {
      provider: source.provider,
      externalOwnerId: source.externalOwnerId,
      externalStoreId: source.externalStoreId,
      configurationFingerprint: fingerprintMenuIdentityTransitionSource(source),
    },
    audit,
    decisions: {
      replacements: [],
      canonicalizations: [],
      merges: [],
    },
  };
}

type MenuSyncApplyRequest =
  | {
      kind: "legacy";
      input: MenuSyncInput;
      expectedPreviewToken: unknown;
    }
  | { kind: "recurring"; projection: CurrentMenuProjection }
  | { kind: "identity-transition"; input: MenuSyncInput; artifact: unknown };

async function applyLockedMenuSync(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  request: Extract<MenuSyncApplyRequest, { kind: "legacy" }>,
): Promise<MenuSnapshotEvaluation>;
async function applyLockedMenuSync(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  request: Extract<MenuSyncApplyRequest, { kind: "recurring" }>,
): Promise<RecurringMenuProjection>;
async function applyLockedMenuSync(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  request: Extract<MenuSyncApplyRequest, { kind: "identity-transition" }>,
): Promise<MenuSnapshotEvaluation>;
async function applyLockedMenuSync(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  request: MenuSyncApplyRequest,
): Promise<MenuSnapshotEvaluation | RecurringMenuProjection> {
  const observationInput = request.kind === "recurring" ? null : request.input;
  if (request.kind === "identity-transition") {
    assertLegacyIdentityTransitionSnapshot(source, request.input);
  } else if (request.kind === "legacy") {
    assertProviderSnapshotCompleteness(
      source.provider,
      request.input.snapshotCompleteness,
      request.input.scopeEvidence,
      source.externalStoreId,
      request.input.observationScope,
    );
  }
  const now = source.databaseNow;
  if (
    observationInput?.takeOverLegacyItems &&
    source.legacyTakeoverAt !== null
  ) {
    throw new Error("LEGACY_TAKEOVER_ALREADY_COMPLETED");
  }
  if (
    request.kind === "identity-transition" &&
    request.input.takeOverLegacyItems
  ) {
    throw new Error("IDENTITY_TRANSITION_LEGACY_TAKEOVER_FORBIDDEN");
  }

  await lockExistingMenuItems(tx, source.canteenId);
  const rows = await selectExistingItems(tx, source.canteenId);
  const existing = collectExistingSyncItems(rows);
  const evaluationSource = {
    id: source.id,
    provider: source.provider,
    legacyAdoptionOpen: source.legacyTakeoverAt === null,
  };
  let evaluation:
    | MenuSnapshotEvaluation
    | MenuSnapshotEvaluation<CurrentMenuProjection>;
  let approvedCanonicalizations: ApprovedMenuIdentityCanonicalization[] = [];
  let approvedMerges: ApprovedMenuIdentityMerge[] = [];
  if (request.kind === "recurring") {
    evaluation = evaluateCurrentMenuProjection(
      evaluationSource,
      request.projection,
      existing,
      { adapterAcceptedEmpty: true },
    );
  } else if (request.kind === "identity-transition") {
    const projectionInput = manualMenuProjection(request.input);
    const identityEvaluation = evaluateMenuIdentityTransitionSnapshot(
      evaluationSource,
      projectionInput,
      existing,
    );
    const approval = verifyMenuIdentityTransitionApproval(
      {
        provider: source.provider,
        externalOwnerId: source.externalOwnerId,
        externalStoreId: source.externalStoreId,
        configurationFingerprint:
          fingerprintMenuIdentityTransitionSource(source),
      },
      identityEvaluation.canonicalState.existingItems.filter(
        (item) => item.menuSourceId === source.id,
      ),
      identityEvaluation.canonicalState.input,
      request.artifact,
    );
    if (
      !identityEvaluation.blockingReasons.some(
        (reason) => reason.code === "MENU_SYNC_IDENTITY_CHURN",
      ) &&
      approval.canonicalizations.length === 0 &&
      approval.merges.length === 0
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_NOT_APPLICABLE");
    }
    approvedCanonicalizations = approval.canonicalizations;
    approvedMerges = approval.merges;
    evaluation = resolveApprovedIdentityTransitionBlocking(
      evaluateMenuIdentityTransitionSnapshot(
        evaluationSource,
        identityEvaluation.canonicalState.input,
        projectApprovedIdentityChanges(
          identityEvaluation.canonicalState.existingItems,
          approvedCanonicalizations,
          approvedMerges,
        ),
        approval.replacements,
      ),
    );
  } else {
    const projectionInput = manualMenuProjection(request.input);
    const legacyEvaluation = evaluateMenuSnapshot(
      evaluationSource,
      projectionInput,
      existing,
      [],
      { adapterAcceptedEmpty: false },
    );
    if (
      typeof request.expectedPreviewToken !== "string" ||
      !request.expectedPreviewToken ||
      request.expectedPreviewToken !==
        createMenuSyncPreviewToken(
          source,
          legacyEvaluation.canonicalState.input,
          legacyEvaluation.canonicalState.existingItems,
        )
    ) {
      throw new Error("MENU_SYNC_STALE");
    }
    evaluation = legacyEvaluation;
  }

  const currentPlan = evaluation.plan;
  const counts = {
    createdCount: currentPlan.actions.filter(
      (action) => action.action === "create",
    ).length,
    updatedCount: currentPlan.actions.filter((action) =>
      ["update", "reactivate", "claim"].includes(action.action),
    ).length,
    deactivatedCount: currentPlan.actions.filter(
      (action) => action.action === "deactivate",
    ).length,
  };
  if (evaluation.blockingDecision.blocked) {
    if (request.kind === "recurring") {
      return {
        status: "blocked",
        evaluation: evaluation as MenuSnapshotEvaluation<CurrentMenuProjection>,
        ...counts,
      };
    }
    throw Object.assign(new Error(evaluation.blockingDecision.code), {
      evaluation,
      observation: evaluation.identityObservation,
      blockingDecision: evaluation.blockingDecision,
    });
  }

  if (approvedCanonicalizations.length > 0) {
    await canonicalizeApprovedIdentities(
      tx,
      source.canteenId,
      now,
      approvedCanonicalizations,
    );
  }
  if (approvedMerges.length > 0) {
    await mergeApprovedIdentityHistory(
      tx,
      source.canteenId,
      now,
      approvedMerges,
    );
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
  if (observationInput?.takeOverLegacyItems) {
    await tx
      .update(canteenMenuSources)
      .set({ legacyTakeoverAt: now, enabled: true, updatedAt: now })
      .where(eq(canteenMenuSources.id, source.id));
  }
  if (request.kind === "recurring") {
    return {
      status: currentPlan.actions.length === 0 ? "unchanged" : "applied",
      evaluation: evaluation as MenuSnapshotEvaluation<CurrentMenuProjection>,
      ...counts,
    };
  }
  return evaluation as MenuSnapshotEvaluation;
}

async function selectLockedMenuSource(
  tx: MenuSyncTransaction,
  sourceId: string,
): Promise<LockedMenuSource | undefined> {
  const [source] = await tx
    .select({
      ...getTableColumns(canteenMenuSources),
      databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
    })
    .from(canteenMenuSources)
    .where(eq(canteenMenuSources.id, sourceId))
    .for("update", { of: canteenMenuSources });
  return source;
}

async function applyMenuSync(
  mode: { kind: "legacy"; sourceId: string },
  input: MenuSyncInput,
  expectedPreviewToken: unknown,
): Promise<MenuSnapshotEvaluation>;
async function applyMenuSync(
  mode: { kind: "identity-transition"; sourceId: string; artifact: unknown },
  input: MenuSyncInput,
): Promise<MenuSnapshotEvaluation>;
async function applyMenuSync(
  mode:
    | { kind: "legacy"; sourceId: string }
    | { kind: "identity-transition"; sourceId: string; artifact: unknown },
  input: MenuSyncInput,
  expectedPreviewToken?: unknown,
): Promise<MenuSnapshotEvaluation> {
  const evaluation = await db.transaction(async (tx) => {
    // Every menu writer locks canteen -> source -> existing items. The parent
    // lock covers inserts, while the fixed order avoids delete-cascade deadlocks.
    const lockedCanteenId = await lockCanteenMenuMutationForSource(
      tx,
      mode.sourceId,
    );
    if (!lockedCanteenId) throw new Error("MENU_SOURCE_NOT_FOUND");
    const source = await selectLockedMenuSource(tx, mode.sourceId);
    if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");
    if (source.canteenId !== lockedCanteenId) {
      throw new Error("MENU_SYNC_STALE");
    }
    return mode.kind === "legacy"
      ? applyLockedMenuSync(tx, source, {
          kind: "legacy",
          input,
          expectedPreviewToken,
        })
      : applyLockedMenuSync(tx, source, {
          kind: "identity-transition",
          input,
          artifact: mode.artifact,
        });
  });

  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.id, mode.sourceId),
    columns: { canteenId: true },
  });
  if (source) {
    revalidatePath(`/admin/canteens/${source.canteenId}`);
    revalidatePath(`/api/canteens/${source.canteenId}/menu`);
    revalidatePath(`/canteen/${source.canteenId}`);
  }
  return evaluation;
}

/** Internal seam used only by recurring source sync after claim validation. */
export function applyRecurringMenuProjection(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  input: CurrentMenuProjection,
): Promise<RecurringMenuProjection> {
  return applyLockedMenuSync(tx, source, {
    kind: "recurring",
    projection: input,
  });
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
