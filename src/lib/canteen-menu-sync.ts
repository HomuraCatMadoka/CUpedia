import type {
  MealPeriod,
  MenuItemPriceOptionInput,
  MenuSyncInput,
  MenuSyncItemInput,
} from "@/lib/canteen-types";

export type ExistingSyncMenuItem = {
  id: string;
  name: string;
  mealPeriod: MealPeriod;
  sortOrder: number;
  svgKey: string;
  priceOptions: MenuItemPriceOptionInput[];
  externalSource: string | null;
  externalKey: string | null;
  isAvailable: boolean;
};

export type MenuSyncAction = {
  action: "create" | "update" | "claim" | "reactivate" | "deactivate";
  itemId: string | null;
  externalKey: string;
  name: string;
  changedFields: string[];
};

export type MenuSyncConflict = {
  externalKey: string;
  name: string;
  reason: "AMBIGUOUS_LEGACY_MATCH" | "LEGACY_MATCH_ALREADY_CLAIMED";
  candidateIds: string[];
};

export type MenuSyncPlan = {
  source: string;
  actions: MenuSyncAction[];
  conflicts: MenuSyncConflict[];
  unchanged: number;
};

export function planMenuSync(
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
): MenuSyncPlan {
  const byExternalKey = new Map(
    existingItems
      .filter(
        (item) =>
          item.externalSource === input.source && item.externalKey !== null,
      )
      .map((item) => [item.externalKey!, item]),
  );
  const legacyByNamePeriod = new Map<string, ExistingSyncMenuItem[]>();
  for (const item of existingItems) {
    if (item.externalSource !== null) continue;
    const key = legacyMatchKey(item.name, item.mealPeriod);
    legacyByNamePeriod.set(key, [...(legacyByNamePeriod.get(key) ?? []), item]);
  }

  const actions: MenuSyncAction[] = [];
  const conflicts: MenuSyncConflict[] = [];
  const seenItemIds = new Set<string>();
  let unchanged = 0;

  for (const incoming of input.items) {
    const externalMatch = byExternalKey.get(incoming.externalKey);
    if (externalMatch) {
      seenItemIds.add(externalMatch.id);
      const changedFields = changedMenuFields(externalMatch, incoming);
      if (!externalMatch.isAvailable) changedFields.push("isAvailable");
      if (changedFields.length === 0) {
        unchanged += 1;
        continue;
      }
      actions.push({
        action: externalMatch.isAvailable ? "update" : "reactivate",
        itemId: externalMatch.id,
        externalKey: incoming.externalKey,
        name: incoming.name,
        changedFields,
      });
      continue;
    }

    const legacyMatches =
      legacyByNamePeriod.get(
        legacyMatchKey(incoming.name, incoming.mealPeriod),
      ) ?? [];
    if (legacyMatches.length > 1) {
      conflicts.push({
        externalKey: incoming.externalKey,
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
          externalKey: incoming.externalKey,
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
        externalKey: incoming.externalKey,
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
      externalKey: incoming.externalKey,
      name: incoming.name,
      changedFields: ["all"],
    });
  }

  for (const item of existingItems) {
    if (
      item.isAvailable &&
      ((item.externalSource === input.source && item.externalKey !== null) ||
        (input.takeOverLegacyItems && item.externalSource === null)) &&
      !seenItemIds.has(item.id)
    ) {
      actions.push({
        action: "deactivate",
        itemId: item.id,
        externalKey: item.externalKey ?? `legacy:${item.id}`,
        name: item.name,
        changedFields: ["isAvailable"],
      });
    }
  }

  return { source: input.source, actions, conflicts, unchanged };
}

function legacyMatchKey(name: string, mealPeriod: MealPeriod): string {
  return `${normalizeMenuName(name)}\u0000${mealPeriod}`;
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
  if (existing.mealPeriod !== incoming.mealPeriod) changed.push("mealPeriod");
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
  return JSON.stringify(left) === JSON.stringify(right);
}
