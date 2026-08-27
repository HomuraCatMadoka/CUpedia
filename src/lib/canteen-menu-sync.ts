import type {
  CurrentMenuProjection,
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncItemInput,
} from "./canteen-types";
import {
  canonicalizeProviderOfferings,
  normalizeCanonicalDishName,
  type CanonicalMenuSyncItem,
} from "./canteen-menu-canonicalization";

export type ApprovedMenuIdentityReplacement = {
  itemId: string;
  previousProductId: string;
  nextProductId: string;
};

export type ExistingSyncMenuItem = {
  id: string;
  name: string;
  mealPeriods: MealPeriodAssignment[];
  sortOrder: number;
  svgKey: string;
  priceOptions: MenuItemPriceOptionInput[];
  menuSourceId: string | null;
  externalProductId: string | null;
  /** All provider offerings mapped to this canonical dish. */
  externalProductIds?: string[];
  /** Currently observed subset of the provider offerings. */
  activeExternalProductIds?: string[];
  isAvailable: boolean;
};

export type MenuSyncAction = {
  action: "create" | "update" | "claim" | "reactivate" | "deactivate";
  itemId: string | null;
  externalProductId: string;
  externalProductIds: string[];
  normalizedName: string;
  name: string;
  changedFields: string[];
};

export type MenuSyncConflict = {
  externalProductId: string;
  name: string;
  reason:
    | "AMBIGUOUS_LEGACY_MATCH"
    | "LEGACY_MATCH_ALREADY_CLAIMED"
    | "LEGACY_MATCH_REQUIRES_TAKEOVER"
    | "MULTIPLE_CANONICAL_DISHES"
    | "CANONICAL_DISH_NAME_DIVERGENCE";
  candidateIds: string[];
};

export type MenuSyncPlan = {
  sourceId: string;
  actions: MenuSyncAction[];
  conflicts: MenuSyncConflict[];
  canonicalItems: CanonicalMenuSyncItem[];
  unchanged: number;
};

type MenuSyncPlanOptions = {
  legacyAdoptionOpen?: boolean;
  takeOverLegacyItems?: boolean;
  approvedIdentityReplacements?: readonly ApprovedMenuIdentityReplacement[];
};

/**
 * Reconcile one already-resolved menu source. Product identity is deliberately
 * independent from name, pricing and meal periods so those attributes can
 * change without replacing the CUpedia menu-item UUID.
 */
export function planMenuSync(
  sourceId: string,
  projection: CurrentMenuProjection,
  existingItems: ExistingSyncMenuItem[],
  options: MenuSyncPlanOptions = {},
): MenuSyncPlan {
  const legacyAdoptionOpen = options.legacyAdoptionOpen ?? true;
  const takeOverLegacyItems = options.takeOverLegacyItems ?? false;
  const approvedIdentityReplacements =
    options.approvedIdentityReplacements ?? [];
  const absenceIsEvidence = projection.absenceAuthority.kind !== "none";
  if (
    projection.absenceAuthority.kind !== "provider-catalog" &&
    takeOverLegacyItems
  ) {
    throw new Error("PARTIAL_SNAPSHOT_LEGACY_TAKEOVER_FORBIDDEN");
  }
  const managedItems = existingItems.filter(
    (item) => item.menuSourceId === sourceId,
  );
  const managedByProduct = new Map<string, ExistingSyncMenuItem>();
  const managedByName = new Map<string, ExistingSyncMenuItem[]>();
  for (const item of managedItems) {
    const offeringIds =
      item.externalProductIds ??
      (item.externalProductId === null ? [] : [item.externalProductId]);
    for (const productId of offeringIds) managedByProduct.set(productId, item);
    const nameKey = normalizeCanonicalDishName(item.name);
    managedByName.set(nameKey, [...(managedByName.get(nameKey) ?? []), item]);
  }
  const approvedByNextId = new Map(
    approvedIdentityReplacements.map((replacement) => [
      replacement.nextProductId,
      replacement,
    ]),
  );
  const legacyByNamePeriod = new Map<string, ExistingSyncMenuItem[]>();
  if (legacyAdoptionOpen) {
    for (const item of existingItems) {
      if (item.menuSourceId !== null) continue;
      const key = legacyMatchKey(item.name, item.mealPeriods);
      legacyByNamePeriod.set(key, [
        ...(legacyByNamePeriod.get(key) ?? []),
        item,
      ]);
    }
  }

  const actions: MenuSyncAction[] = [];
  const conflicts: MenuSyncConflict[] = [];
  const seenItemIds = new Set<string>();
  let unchanged = 0;
  const canonicalItems = canonicalizeProviderOfferings(projection.items);

  for (const incoming of canonicalItems) {
    const externalProductIds = incoming.offerings.map(
      (offering) => offering.externalProductId,
    );
    const candidates = new Map<string, ExistingSyncMenuItem>();
    for (const productId of externalProductIds) {
      const approvedReplacement = approvedByNextId.get(productId);
      const candidate = approvedReplacement
        ? managedByProduct.get(approvedReplacement.previousProductId)
        : managedByProduct.get(productId);
      if (candidate) candidates.set(candidate.id, candidate);
    }
    for (const candidate of managedByName.get(incoming.normalizedName) ?? []) {
      candidates.set(candidate.id, candidate);
    }
    if (candidates.size > 1) {
      for (const candidateId of candidates.keys()) seenItemIds.add(candidateId);
      conflicts.push({
        externalProductId: externalProductIds[0],
        name: incoming.name,
        reason: "MULTIPLE_CANONICAL_DISHES",
        candidateIds: [...candidates.keys()].sort(),
      });
      continue;
    }
    const managed = [...candidates.values()][0];
    const approvedReplacement = externalProductIds
      .map((productId) => approvedByNextId.get(productId))
      .find((replacement) => replacement !== undefined);
    if (
      approvedReplacement &&
      (!managed || managed.id !== approvedReplacement.itemId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_STALE");
    }
    const identityChanged = approvedReplacement !== undefined;
    if (managed) {
      if (seenItemIds.has(managed.id)) {
        conflicts.push({
          externalProductId: externalProductIds[0],
          name: incoming.name,
          reason: "CANONICAL_DISH_NAME_DIVERGENCE",
          candidateIds: [managed.id],
        });
        continue;
      }
      seenItemIds.add(managed.id);
      const changedFields = changedMenuFields(managed, {
        ...incoming,
        externalProductId: managed.externalProductId ?? externalProductIds[0],
      });
      const previousOfferings = new Set(
        managed.activeExternalProductIds ??
          managed.externalProductIds ??
          (managed.externalProductId ? [managed.externalProductId] : []),
      );
      if (
        previousOfferings.size !== externalProductIds.length ||
        externalProductIds.some(
          (productId) => !previousOfferings.has(productId),
        )
      ) {
        changedFields.push("offerings");
      }
      if (identityChanged) changedFields.unshift("externalIdentity");
      if (!managed.isAvailable) changedFields.push("isAvailable");
      if (changedFields.length === 0) {
        unchanged += 1;
      } else {
        actions.push({
          action: managed.isAvailable ? "update" : "reactivate",
          itemId: managed.id,
          externalProductId: managed.externalProductId ?? externalProductIds[0],
          externalProductIds,
          normalizedName: incoming.normalizedName,
          name: incoming.name,
          changedFields,
        });
      }
      continue;
    }

    const legacyMatches =
      legacyByNamePeriod.get(
        legacyMatchKey(incoming.name, incoming.mealPeriods),
      ) ?? [];
    if (!takeOverLegacyItems && legacyMatches.length > 0) {
      conflicts.push({
        externalProductId: externalProductIds[0],
        name: incoming.name,
        reason: "LEGACY_MATCH_REQUIRES_TAKEOVER",
        candidateIds: legacyMatches.map((item) => item.id),
      });
      continue;
    }
    if (legacyMatches.length > 1) {
      conflicts.push({
        externalProductId: externalProductIds[0],
        name: incoming.name,
        reason: "AMBIGUOUS_LEGACY_MATCH",
        candidateIds: legacyMatches.map((item) => item.id),
      });
      continue;
    }
    if (legacyMatches.length === 1) {
      const match = legacyMatches[0];
      if (seenItemIds.has(match.id)) {
        conflicts.push({
          externalProductId: externalProductIds[0],
          name: incoming.name,
          reason: "LEGACY_MATCH_ALREADY_CLAIMED",
          candidateIds: [match.id],
        });
        continue;
      }
      seenItemIds.add(match.id);
      actions.push({
        action: "claim",
        itemId: match.id,
        externalProductId: externalProductIds[0],
        externalProductIds,
        normalizedName: incoming.normalizedName,
        name: incoming.name,
        changedFields: [
          "externalIdentity",
          ...changedMenuFields(match, {
            ...incoming,
            externalProductId: externalProductIds[0],
          }),
        ],
      });
      continue;
    }

    actions.push({
      action: "create",
      itemId: null,
      externalProductId: externalProductIds[0],
      externalProductIds,
      normalizedName: incoming.normalizedName,
      name: incoming.name,
      changedFields: ["all"],
    });
  }

  if (absenceIsEvidence) {
    for (const item of existingItems) {
      const belongsToSource = item.menuSourceId === sourceId;
      const adoptableLegacy = takeOverLegacyItems && item.menuSourceId === null;
      if (
        item.isAvailable &&
        (belongsToSource || adoptableLegacy) &&
        !seenItemIds.has(item.id)
      ) {
        actions.push({
          action: "deactivate",
          itemId: item.id,
          externalProductId: item.externalProductId ?? `legacy:${item.id}`,
          externalProductIds:
            item.externalProductIds ??
            (item.externalProductId ? [item.externalProductId] : []),
          normalizedName: normalizeCanonicalDishName(item.name),
          name: item.name,
          changedFields: ["isAvailable"],
        });
      }
    }
  }

  return { sourceId, actions, conflicts, canonicalItems, unchanged };
}

function legacyMatchKey(
  name: string,
  mealPeriods: readonly MealPeriodAssignment[],
): string {
  return `${normalizeCanonicalDishName(name)}\u0000${periodsKey(mealPeriods)}`;
}

function periodsKey(mealPeriods: readonly MealPeriodAssignment[]): string {
  return [...mealPeriods].sort().join(",");
}

function changedMenuFields(
  existing: ExistingSyncMenuItem,
  incoming: MenuSyncItemInput,
): string[] {
  const changed: string[] = [];
  if (existing.name !== incoming.name) changed.push("name");
  if (periodsKey(existing.mealPeriods) !== periodsKey(incoming.mealPeriods)) {
    changed.push("mealPeriods");
  }
  if (existing.sortOrder !== incoming.sortOrder) changed.push("sortOrder");
  if (existing.svgKey !== incoming.svgKey) changed.push("svgKey");
  if (!samePriceOptions(existing.priceOptions, incoming.priceOptions)) {
    changed.push("pricing");
  }
  return changed;
}

function samePriceOptions(
  left: MenuItemPriceOptionInput[],
  right: MenuItemPriceOptionInput[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((option, index) => {
    const other = right[index];
    return (
      option.label === other.label &&
      option.amountMinor === other.amountMinor &&
      option.currency === other.currency &&
      option.sortOrder === other.sortOrder
    );
  });
}
