import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuIdentityTransitions,
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuOfferingOccurrences,
  canteenMenuProviderOfferings,
  canteenMenuSources,
  siteSettings,
} from "@/db/schema";
import {
  and,
  eq,
  getTableColumns,
  inArray,
  notInArray,
  sql,
} from "drizzle-orm";
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
import type {
  ApprovedMenuIdentityReplacement,
  ExistingSyncMenuItem,
} from "./canteen-menu-sync";
import {
  menuProviderOccurrences,
  type CurrentMenuProjection,
  type MealPeriod,
  type MealPeriodAssignment,
  type MenuItemPriceOptionInput,
  type MenuSyncInput,
  type MenuSyncItemInput,
} from "./canteen-types";
import { assertProviderSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";
import { normalizeCanonicalDishName } from "./canteen-menu-canonicalization";
import {
  planCanonicalIdentityEvolution,
  type CanonicalIdentityEvolution,
  type CanonicalIdentityItem,
} from "./canteen-menu-identity-evolution";

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
  normalizedName: string | null;
  createdAt: Date;
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

type SyncOfferingRow = {
  menuItemId: string;
  externalProductId: string;
  providerName: string;
  normalizedName: string;
  createdAt: Date;
  isAvailable: boolean;
};

export const CANTEEN_MENU_IDENTITY_EVOLUTION_SETTING =
  "canteen_menu_identity_evolution";

type CanonicalIdentityTransitionFact = {
  kind: "rename" | "split" | "merge";
  fromMenuItemId: string;
  toMenuItemId: string;
  fromNormalizedName: string;
  toNormalizedName: string;
  externalProductIds: string[];
};

function canonicalIdentityTransitionEventKey(
  source: LockedMenuSource,
  transition: CanonicalIdentityTransitionFact,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        observation: source.syncClaimToken ?? source.databaseNow.toISOString(),
        sourceId: source.id,
        ...transition,
        externalProductIds: [...transition.externalProductIds].sort(),
      }),
    )
    .digest("hex");
}

async function isCanonicalIdentityEvolutionEnabled(
  tx: MenuSyncTransaction,
): Promise<boolean> {
  const [setting] = await tx
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, CANTEEN_MENU_IDENTITY_EVOLUTION_SETTING));
  return setting?.value === "enabled";
}

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

type MenuIdentityHistoryMerge = {
  survivorItemId: string;
  mergedItemIds: string[];
  nextProductId?: string;
  previousProductIds?: string[];
  normalizedName?: string;
};

async function mergeCanonicalDishHistory(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  merges: readonly MenuIdentityHistoryMerge[],
): Promise<void> {
  const canteenId = source.canteenId;
  const menuSourceId = source.id;
  const now = source.databaseNow;
  for (const merge of merges) {
    const allItemIds = [merge.survivorItemId, ...merge.mergedItemIds];
    const identityRows = await tx
      .select({
        id: canteenMenuItems.id,
        name: canteenMenuItems.name,
        normalizedName: canteenMenuItems.normalizedName,
        externalProductId: canteenMenuItems.externalProductId,
      })
      .from(canteenMenuItems)
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          inArray(canteenMenuItems.id, allItemIds),
        ),
      )
      .for("update", { of: canteenMenuItems });
    const identityById = new Map(identityRows.map((item) => [item.id, item]));
    const survivorIdentity = identityById.get(merge.survivorItemId);
    if (!survivorIdentity || identityRows.length !== allItemIds.length) {
      throw new Error("MENU_SYNC_STALE");
    }
    const offeringRows = await tx
      .select({
        menuItemId: canteenMenuProviderOfferings.menuItemId,
        externalProductId: canteenMenuProviderOfferings.externalProductId,
      })
      .from(canteenMenuProviderOfferings)
      .where(inArray(canteenMenuProviderOfferings.menuItemId, allItemIds))
      .for("update", { of: canteenMenuProviderOfferings });
    const votes = await tx
      .select({
        id: canteenDishVotes.id,
        menuItemId: canteenDishVotes.menuItemId,
        userId: canteenDishVotes.userId,
        anonymousSessionId: canteenDishVotes.anonymousSessionId,
        vote: canteenDishVotes.vote,
        createdAt: canteenDishVotes.createdAt,
        updatedAt: canteenDishVotes.updatedAt,
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
      const ordered = actorVotes.toSorted(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
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
      .update(canteenMenuProviderOfferings)
      .set({ menuItemId: merge.survivorItemId, updatedAt: now })
      .where(
        and(
          eq(canteenMenuProviderOfferings.menuSourceId, menuSourceId),
          inArray(canteenMenuProviderOfferings.menuItemId, merge.mergedItemIds),
        ),
      );
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
    if (merge.nextProductId) {
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
    const transitionValues = merge.mergedItemIds.map((mergedItemId) => {
      const retired = identityById.get(mergedItemId)!;
      const externalProductIds = offeringRows
        .filter((offering) => offering.menuItemId === mergedItemId)
        .map((offering) => offering.externalProductId);
      if (externalProductIds.length === 0 && retired.externalProductId) {
        externalProductIds.push(retired.externalProductId);
      }
      if (externalProductIds.length === 0) {
        throw new Error("MENU_IDENTITY_TRANSITION_EMPTY_PRODUCTS");
      }
      const transition: CanonicalIdentityTransitionFact = {
        kind: "merge" as const,
        fromMenuItemId: mergedItemId,
        toMenuItemId: merge.survivorItemId,
        fromNormalizedName:
          retired.normalizedName ?? normalizeCanonicalDishName(retired.name),
        toNormalizedName:
          merge.normalizedName ??
          survivorIdentity.normalizedName ??
          normalizeCanonicalDishName(survivorIdentity.name),
        externalProductIds: [...new Set(externalProductIds)].sort(),
      };
      return {
        canteenId,
        menuSourceId,
        ...transition,
        eventKey: canonicalIdentityTransitionEventKey(source, transition),
        createdAt: now,
      };
    });
    if (transitionValues.length > 0) {
      await tx
        .insert(canteenMenuIdentityTransitions)
        .values(transitionValues)
        .onConflictDoNothing({
          target: [
            canteenMenuIdentityTransitions.menuSourceId,
            canteenMenuIdentityTransitions.eventKey,
          ],
        });
    }
  }
}

async function persistCanonicalIdentityEvolutionBeforeMenu(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  evolution: CanonicalIdentityEvolution,
): Promise<void> {
  if (evolution.merges.length > 0) {
    await mergeCanonicalDishHistory(tx, source, evolution.merges);
  }
  const splitSourceIds = [
    ...new Set(evolution.splits.map((split) => split.sourceItemId)),
  ];
  if (splitSourceIds.length > 0) {
    await tx
      .update(canteenMenuItems)
      .set({ menuSourceId: null, externalProductId: null })
      .where(
        and(
          eq(canteenMenuItems.canteenId, source.canteenId),
          inArray(canteenMenuItems.id, splitSourceIds),
        ),
      );
    for (const itemId of splitSourceIds) {
      const projected = evolution.projectedItems.find(
        (item) => item.id === itemId,
      );
      if (!projected?.externalProductId) throw new Error("MENU_SYNC_STALE");
      await tx
        .update(canteenMenuItems)
        .set({
          menuSourceId: source.id,
          externalProductId: projected.externalProductId,
          updatedAt: source.databaseNow,
        })
        .where(
          and(
            eq(canteenMenuItems.canteenId, source.canteenId),
            eq(canteenMenuItems.id, itemId),
          ),
        );
    }
  }
  for (const split of evolution.splits) {
    if (!split.targetItemId) continue;
    await tx
      .update(canteenMenuProviderOfferings)
      .set({
        menuItemId: split.targetItemId,
        updatedAt: source.databaseNow,
      })
      .where(
        and(
          eq(canteenMenuProviderOfferings.menuSourceId, source.id),
          eq(canteenMenuProviderOfferings.menuItemId, split.sourceItemId),
          inArray(
            canteenMenuProviderOfferings.externalProductId,
            split.externalProductIds,
          ),
        ),
      );
  }
}

async function recordCanonicalIdentityEvolution(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  evolution: CanonicalIdentityEvolution,
  persistedItemIds: ReadonlyMap<string, string>,
): Promise<void> {
  const transitions: CanonicalIdentityTransitionFact[] = [
    ...evolution.renames.map((rename) => ({
      kind: "rename" as const,
      fromMenuItemId: rename.itemId,
      toMenuItemId: rename.itemId,
      fromNormalizedName: rename.fromNormalizedName,
      toNormalizedName: rename.toNormalizedName,
      externalProductIds: rename.externalProductIds,
    })),
    ...evolution.splits.map((split) => {
      const targetItemId =
        split.targetItemId ?? persistedItemIds.get(split.toNormalizedName);
      if (!targetItemId) throw new Error("MENU_SYNC_STALE");
      return {
        kind: "split" as const,
        fromMenuItemId: split.sourceItemId,
        toMenuItemId: targetItemId,
        fromNormalizedName: split.fromNormalizedName,
        toNormalizedName: split.toNormalizedName,
        externalProductIds: split.externalProductIds,
      };
    }),
  ].filter((transition) => transition.externalProductIds.length > 0);
  const values = transitions.map((transition) => ({
    canteenId: source.canteenId,
    menuSourceId: source.id,
    ...transition,
    eventKey: canonicalIdentityTransitionEventKey(source, transition),
    createdAt: source.databaseNow,
  }));
  if (values.length === 0) return;
  await tx
    .insert(canteenMenuIdentityTransitions)
    .values(values)
    .onConflictDoNothing({
      target: [
        canteenMenuIdentityTransitions.menuSourceId,
        canteenMenuIdentityTransitions.eventKey,
      ],
    });
}

async function seedExistingProviderOfferings(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  existingItems: readonly CanonicalIdentityItem[],
): Promise<void> {
  const values = existingItems.flatMap((existingItem) =>
    existingItem.menuSourceId === source.id
      ? (
          existingItem.externalProductIds ??
          (existingItem.externalProductId
            ? [existingItem.externalProductId]
            : [])
        ).map((externalProductId) => {
          const evidence = existingItem.providerOfferings.find(
            (offering) => offering.externalProductId === externalProductId,
          );
          return {
            canteenId: source.canteenId,
            menuSourceId: source.id,
            menuItemId: existingItem.id,
            externalProductId,
            providerName: evidence?.providerName ?? existingItem.name,
            normalizedName:
              evidence?.normalizedName ?? existingItem.normalizedName,
            isAvailable:
              existingItem.activeExternalProductIds?.includes(
                externalProductId,
              ) ?? existingItem.isAvailable,
            createdAt: evidence?.createdAt ?? source.databaseNow,
            updatedAt: source.databaseNow,
          };
        })
      : [],
  );
  if (values.length === 0) return;
  await tx
    .insert(canteenMenuProviderOfferings)
    .values(values)
    .onConflictDoNothing({
      target: [
        canteenMenuProviderOfferings.menuSourceId,
        canteenMenuProviderOfferings.externalProductId,
      ],
    });
}

async function retireApprovedOfferingAliases(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  transitions: readonly (
    | ApprovedMenuIdentityReplacement
    | ApprovedMenuIdentityCanonicalization
  )[],
): Promise<void> {
  if (transitions.length === 0) return;
  await tx
    .update(canteenMenuProviderOfferings)
    .set({ isAvailable: false, updatedAt: source.databaseNow })
    .where(
      and(
        eq(canteenMenuProviderOfferings.menuSourceId, source.id),
        inArray(
          canteenMenuProviderOfferings.externalProductId,
          transitions.map((transition) => transition.previousProductId),
        ),
      ),
    );
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

function collectExistingSyncItems(
  rows: SyncMenuRow[],
  offerings: SyncOfferingRow[] = [],
): CanonicalIdentityItem[] {
  const items = new Map<string, CanonicalIdentityItem>();
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
      normalizedName:
        row.normalizedName ?? normalizeCanonicalDishName(row.name),
      createdAt: row.createdAt,
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
      providerOfferings: [],
      isAvailable: row.isAvailable,
    });
  }
  for (const offering of offerings) {
    const item = items.get(offering.menuItemId);
    if (
      item &&
      !item.externalProductIds?.includes(offering.externalProductId)
    ) {
      item.externalProductIds = [
        ...(item.externalProductIds ?? []),
        offering.externalProductId,
      ];
    }
    if (item) item.activeExternalProductIds ??= [];
    if (item) {
      item.providerOfferings.push({
        externalProductId: offering.externalProductId,
        providerName: offering.providerName,
        normalizedName: offering.normalizedName,
        createdAt: offering.createdAt,
        isAvailable: offering.isAvailable,
      });
    }
    if (item && offering.isAvailable) {
      item.activeExternalProductIds = [
        ...(item.activeExternalProductIds ?? []),
        offering.externalProductId,
      ];
    }
  }
  for (const item of items.values()) {
    if (
      item.providerOfferings.length === 0 &&
      item.externalProductId !== null
    ) {
      item.providerOfferings.push({
        externalProductId: item.externalProductId,
        providerName: item.name,
        normalizedName: item.normalizedName,
        createdAt: item.createdAt,
        isAvailable: item.isAvailable,
      });
    }
    item.externalProductIds?.sort();
    item.activeExternalProductIds?.sort();
    item.providerOfferings.sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.externalProductId.localeCompare(right.externalProductId),
    );
    item.priceOptions.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return [...items.values()];
}

function evaluationItems(
  items: readonly CanonicalIdentityItem[],
): ExistingSyncMenuItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    mealPeriods: [...item.mealPeriods],
    sortOrder: item.sortOrder,
    svgKey: item.svgKey,
    priceOptions: item.priceOptions.map((option) => ({ ...option })),
    menuSourceId: item.menuSourceId,
    externalProductId: item.externalProductId,
    externalProductIds: item.externalProductIds
      ? [...item.externalProductIds]
      : undefined,
    activeExternalProductIds: item.activeExternalProductIds
      ? [...item.activeExternalProductIds]
      : undefined,
    isAvailable: item.isAvailable,
  }));
}

function syncMenuSelection() {
  return {
    id: canteenMenuItems.id,
    name: canteenMenuItems.name,
    normalizedName: canteenMenuItems.normalizedName,
    createdAt: canteenMenuItems.createdAt,
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

async function selectExistingOfferings(
  executor: Pick<typeof db, "select">,
  canteenId: string,
) {
  return executor
    .select({
      menuItemId: canteenMenuProviderOfferings.menuItemId,
      externalProductId: canteenMenuProviderOfferings.externalProductId,
      providerName: canteenMenuProviderOfferings.providerName,
      normalizedName: canteenMenuProviderOfferings.normalizedName,
      createdAt: canteenMenuProviderOfferings.createdAt,
      isAvailable: canteenMenuProviderOfferings.isAvailable,
    })
    .from(canteenMenuProviderOfferings)
    .innerJoin(
      canteenMenuItems,
      eq(canteenMenuItems.id, canteenMenuProviderOfferings.menuItemId),
    )
    .where(eq(canteenMenuItems.canteenId, canteenId))
    .orderBy(
      canteenMenuProviderOfferings.menuItemId,
      canteenMenuProviderOfferings.externalProductId,
    );
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
    await selectExistingOfferings(db, source.canteenId),
  );
  const evaluation = evaluateMenuSnapshot(
    {
      id: source.id,
      provider: source.provider,
      legacyAdoptionOpen: source.legacyTakeoverAt === null,
    },
    projectionInput,
    evaluationItems(existing),
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
    await selectExistingOfferings(db, source.canteenId),
  );
  const evaluation = evaluateMenuIdentityTransitionSnapshot(
    {
      id: source.id,
      provider: source.provider,
      legacyAdoptionOpen: source.legacyTakeoverAt === null,
    },
    projectionInput,
    evaluationItems(existing),
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
  | {
      kind: "recurring";
      projection: CurrentMenuProjection;
      acceptedPeriodItems: Partial<
        Record<MealPeriod, readonly MenuSyncItemInput[]>
      >;
    }
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
  const offerings = await selectExistingOfferings(tx, source.canteenId);
  const existing = collectExistingSyncItems(rows, offerings);
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
  let approvedReplacements: ApprovedMenuIdentityReplacement[] = [];
  let canonicalIdentityEvolution: CanonicalIdentityEvolution | null = null;
  if (request.kind === "recurring") {
    if (await isCanonicalIdentityEvolutionEnabled(tx)) {
      canonicalIdentityEvolution = planCanonicalIdentityEvolution({
        sourceId: source.id,
        existingItems: existing,
        projection: request.projection,
      });
    }
    evaluation = evaluateCurrentMenuProjection(
      evaluationSource,
      request.projection,
      evaluationItems(canonicalIdentityEvolution?.projectedItems ?? existing),
      { adapterAcceptedEmpty: true },
      request.acceptedPeriodItems,
    );
  } else if (request.kind === "identity-transition") {
    const projectionInput = manualMenuProjection(request.input);
    const identityEvaluation = evaluateMenuIdentityTransitionSnapshot(
      evaluationSource,
      projectionInput,
      evaluationItems(existing),
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
      approval.replacements.length === 0 &&
      approval.canonicalizations.length === 0 &&
      approval.merges.length === 0
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_NOT_APPLICABLE");
    }
    approvedCanonicalizations = approval.canonicalizations;
    approvedMerges = approval.merges;
    approvedReplacements = approval.replacements;
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
      evaluationItems(existing),
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

  await seedExistingProviderOfferings(tx, source, existing);
  await retireApprovedOfferingAliases(tx, source, [
    ...approvedReplacements,
    ...approvedCanonicalizations,
  ]);

  if (approvedCanonicalizations.length > 0) {
    await canonicalizeApprovedIdentities(
      tx,
      source.canteenId,
      now,
      approvedCanonicalizations,
    );
  }
  if (approvedMerges.length > 0) {
    await mergeCanonicalDishHistory(tx, source, approvedMerges);
  }
  if (canonicalIdentityEvolution) {
    await persistCanonicalIdentityEvolutionBeforeMenu(
      tx,
      source,
      canonicalIdentityEvolution,
    );
  }

  const actionByName = new Map(
    currentPlan.actions
      .filter((action) => action.action !== "deactivate")
      .map((action) => [action.normalizedName, action]),
  );
  const existingByProduct = new Map(
    evaluation.canonicalState.existingItems.flatMap((item) =>
      item.menuSourceId === source.id
        ? (
            item.externalProductIds ??
            (item.externalProductId ? [item.externalProductId] : [])
          ).map((productId) => [productId, item] as const)
        : [],
    ),
  );
  const existingByName = new Map(
    evaluation.canonicalState.existingItems
      .filter((item) => item.menuSourceId === source.id)
      .map((item) => [normalizeCanonicalDishName(item.name), item]),
  );
  const observedOfferingIds = currentPlan.canonicalItems.flatMap((item) =>
    item.offerings.map((offering) => offering.externalProductId),
  );

  const offeringAbsenceIsEvidence =
    request.kind === "recurring"
      ? request.projection.absenceAuthority.kind !== "none"
      : request.input.observationScope?.kind !== "meal-period" &&
        request.input.snapshotCompleteness === "complete";
  if (offeringAbsenceIsEvidence) {
    await tx
      .update(canteenMenuProviderOfferings)
      .set({ isAvailable: false, updatedAt: now })
      .where(
        observedOfferingIds.length > 0
          ? and(
              eq(canteenMenuProviderOfferings.menuSourceId, source.id),
              notInArray(
                canteenMenuProviderOfferings.externalProductId,
                observedOfferingIds,
              ),
            )
          : eq(canteenMenuProviderOfferings.menuSourceId, source.id),
      );
  }

  const persistedItemIds = new Map<string, string>();
  for (const item of currentPlan.canonicalItems) {
    const action = actionByName.get(item.normalizedName);
    let itemId: string;
    if (action?.action === "create") {
      const [created] = await tx
        .insert(canteenMenuItems)
        .values({
          canteenId: source.canteenId,
          name: item.name,
          normalizedName: item.normalizedName,
          price: null,
          mealPeriods: item.mealPeriods,
          sortOrder: item.sortOrder,
          svgKey: item.svgKey,
          menuSourceId: source.id,
          externalProductId: action.externalProductId,
          isAvailable: true,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: canteenMenuItems.id });
      itemId = created.id;
      if (item.priceOptions.length > 0) {
        await tx
          .insert(canteenMenuItemPrices)
          .values(priceOptionValues(created.id, item.priceOptions, now));
      }
    } else {
      itemId =
        action?.itemId ??
        item.offerings
          .map((offering) => existingByProduct.get(offering.externalProductId))
          .find((existingItem) => existingItem !== undefined)?.id ??
        existingByName.get(item.normalizedName)?.id ??
        "";
      if (!itemId) throw new Error("MENU_SYNC_STALE");
      const existingItem = evaluation.canonicalState.existingItems.find(
        (candidate) => candidate.id === itemId,
      );
      await tx
        .update(canteenMenuItems)
        .set({
          name: item.name,
          normalizedName: item.normalizedName,
          price: null,
          mealPeriods: item.mealPeriods,
          sortOrder: item.sortOrder,
          svgKey: item.svgKey,
          menuSourceId: source.id,
          externalProductId:
            action?.changedFields.includes("externalIdentity") === true
              ? item.offerings[0].externalProductId
              : (existingItem?.externalProductId ??
                action?.externalProductId ??
                item.offerings[0].externalProductId),
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
    persistedItemIds.set(item.normalizedName, itemId);
  }

  const offeringFacts = currentPlan.canonicalItems.flatMap((item) =>
    item.offerings.map((offering) => ({
      item,
      offering,
      menuItemId: persistedItemIds.get(item.normalizedName)!,
    })),
  );
  if (offeringFacts.length > 0) {
    const savedOfferings = await tx
      .insert(canteenMenuProviderOfferings)
      .values(
        offeringFacts.map(({ item, offering, menuItemId }) => ({
          canteenId: source.canteenId,
          menuSourceId: source.id,
          menuItemId,
          externalProductId: offering.externalProductId,
          providerName: offering.name,
          normalizedName: item.normalizedName,
          isAvailable: true,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          canteenMenuProviderOfferings.menuSourceId,
          canteenMenuProviderOfferings.externalProductId,
        ],
        set: {
          menuItemId: sql`excluded.menu_item_id`,
          providerName: sql`excluded.provider_name`,
          normalizedName: sql`excluded.normalized_name`,
          isAvailable: true,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning({
        id: canteenMenuProviderOfferings.id,
        externalProductId: canteenMenuProviderOfferings.externalProductId,
      });
    const offeringIdByProduct = new Map(
      savedOfferings.map((offering) => [
        offering.externalProductId,
        offering.id,
      ]),
    );
    await tx.delete(canteenMenuOfferingOccurrences).where(
      inArray(
        canteenMenuOfferingOccurrences.offeringId,
        savedOfferings.map((offering) => offering.id),
      ),
    );
    const occurrenceValues = offeringFacts.flatMap(({ offering }) =>
      menuProviderOccurrences(offering).map((occurrence) => ({
        offeringId: offeringIdByProduct.get(offering.externalProductId)!,
        mealPeriod: occurrence.mealPeriod,
        categoryKey: occurrence.categoryKey,
        sortOrder: occurrence.sortOrder,
        priceOptions: occurrence.priceOptions,
        observedAt: now,
      })),
    );
    if (occurrenceValues.length > 0) {
      await tx.insert(canteenMenuOfferingOccurrences).values(occurrenceValues);
    }
  }

  if (canonicalIdentityEvolution) {
    await recordCanonicalIdentityEvolution(
      tx,
      source,
      canonicalIdentityEvolution,
      persistedItemIds,
    );
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
  acceptedPeriodItems: Partial<
    Record<MealPeriod, readonly MenuSyncItemInput[]>
  > = {},
): Promise<RecurringMenuProjection> {
  return applyLockedMenuSync(tx, source, {
    kind: "recurring",
    projection: input,
    acceptedPeriodItems,
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
