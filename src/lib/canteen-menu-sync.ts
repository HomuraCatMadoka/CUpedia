import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncInput,
  MenuSyncItemInput,
} from "./canteen-types";
import { snapshotAbsenceIsEvidence } from "./canteen-menu-snapshot-completeness";

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
  isAvailable: boolean;
};

export type MenuSyncAction = {
  action: "create" | "update" | "claim" | "reactivate" | "deactivate";
  itemId: string | null;
  externalProductId: string;
  name: string;
  changedFields: string[];
};

export type MenuSyncConflict = {
  externalProductId: string;
  name: string;
  reason:
    | "AMBIGUOUS_LEGACY_MATCH"
    | "LEGACY_MATCH_ALREADY_CLAIMED"
    | "LEGACY_MATCH_REQUIRES_TAKEOVER";
  candidateIds: string[];
};

export type MenuSyncPlan = {
  sourceId: string;
  actions: MenuSyncAction[];
  conflicts: MenuSyncConflict[];
  unchanged: number;
};

/**
 * Reconcile one already-resolved menu source. Product identity is deliberately
 * independent from name, pricing and meal periods so those attributes can
 * change without replacing the CUpedia menu-item UUID.
 */
export function planMenuSync(
  sourceId: string,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
  legacyAdoptionOpen = true,
  approvedIdentityReplacements: readonly ApprovedMenuIdentityReplacement[] = [],
): MenuSyncPlan {
  const absenceIsEvidence = snapshotAbsenceIsEvidence(
    input.snapshotCompleteness,
  );
  if (!absenceIsEvidence && input.takeOverLegacyItems) {
    throw new Error("PARTIAL_SNAPSHOT_LEGACY_TAKEOVER_FORBIDDEN");
  }
  const managedByProduct = new Map(
    existingItems
      .filter(
        (item) =>
          item.menuSourceId === sourceId && item.externalProductId !== null,
      )
      .map((item) => [item.externalProductId!, item]),
  );
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

  for (const incoming of input.items) {
    const approvedReplacement = approvedByNextId.get(
      incoming.externalProductId,
    );
    const managed = approvedReplacement
      ? managedByProduct.get(approvedReplacement.previousProductId)
      : managedByProduct.get(incoming.externalProductId);
    if (
      approvedReplacement &&
      (!managed || managed.id !== approvedReplacement.itemId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_STALE");
    }
    const identityChanged = approvedReplacement !== undefined;
    if (managed) {
      seenItemIds.add(managed.id);
      const changedFields = changedMenuFields(managed, incoming);
      if (identityChanged) changedFields.unshift("externalIdentity");
      if (!managed.isAvailable) changedFields.push("isAvailable");
      if (changedFields.length === 0) {
        unchanged += 1;
      } else {
        actions.push({
          action: managed.isAvailable ? "update" : "reactivate",
          itemId: managed.id,
          externalProductId: incoming.externalProductId,
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
    if (!input.takeOverLegacyItems && legacyMatches.length > 0) {
      conflicts.push({
        externalProductId: incoming.externalProductId,
        name: incoming.name,
        reason: "LEGACY_MATCH_REQUIRES_TAKEOVER",
        candidateIds: legacyMatches.map((item) => item.id),
      });
      continue;
    }
    if (legacyMatches.length > 1) {
      conflicts.push({
        externalProductId: incoming.externalProductId,
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
          externalProductId: incoming.externalProductId,
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
        externalProductId: incoming.externalProductId,
        name: incoming.name,
        changedFields: [
          "externalIdentity",
          ...changedMenuFields(match, incoming),
        ],
      });
      continue;
    }

    actions.push({
      action: "create",
      itemId: null,
      externalProductId: incoming.externalProductId,
      name: incoming.name,
      changedFields: ["all"],
    });
  }

  if (absenceIsEvidence) {
    for (const item of existingItems) {
      const belongsToSource = item.menuSourceId === sourceId;
      const adoptableLegacy =
        input.takeOverLegacyItems && item.menuSourceId === null;
      if (
        item.isAvailable &&
        (belongsToSource || adoptableLegacy) &&
        !seenItemIds.has(item.id)
      ) {
        actions.push({
          action: "deactivate",
          itemId: item.id,
          externalProductId: item.externalProductId ?? `legacy:${item.id}`,
          name: item.name,
          changedFields: ["isAvailable"],
        });
      }
    }
  }

  return { sourceId, actions, conflicts, unchanged };
}

function legacyMatchKey(
  name: string,
  mealPeriods: readonly MealPeriodAssignment[],
): string {
  return `${normalizeMenuName(name)}\u0000${periodsKey(mealPeriods)}`;
}

function periodsKey(mealPeriods: readonly MealPeriodAssignment[]): string {
  return [...mealPeriods].sort().join(",");
}

function normalizeMenuName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
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
