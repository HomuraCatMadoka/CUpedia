import type { CurrentMenuProjection } from "./canteen-types";
import { canonicalizeProviderOfferings } from "./canteen-menu-canonicalization";
import type { ExistingSyncMenuItem } from "./canteen-menu-sync";

export type CanonicalIdentityProviderOffering = {
  externalProductId: string;
  providerName?: string;
  normalizedName: string;
  createdAt: Date;
  isAvailable: boolean;
};

export type CanonicalIdentityItem = ExistingSyncMenuItem & {
  normalizedName: string;
  createdAt: Date;
  providerOfferings: CanonicalIdentityProviderOffering[];
};

export type CanonicalIdentityRename = {
  itemId: string;
  fromNormalizedName: string;
  toNormalizedName: string;
  externalProductIds: string[];
};

export type CanonicalIdentitySplit = {
  sourceItemId: string;
  targetItemId: string | null;
  fromNormalizedName: string;
  toNormalizedName: string;
  externalProductIds: string[];
};

export type CanonicalIdentityMerge = {
  survivorItemId: string;
  mergedItemIds: string[];
  normalizedName: string;
  externalProductIds: string[];
};

export type CanonicalIdentityEvolution = {
  projectedItems: CanonicalIdentityItem[];
  renames: CanonicalIdentityRename[];
  splits: CanonicalIdentitySplit[];
  merges: CanonicalIdentityMerge[];
};

type PlanCanonicalIdentityEvolutionInput = {
  sourceId: string;
  existingItems: readonly CanonicalIdentityItem[];
  projection: CurrentMenuProjection;
};

function compareCreatedIdentity(
  left: Pick<CanonicalIdentityItem, "createdAt" | "id">,
  right: Pick<CanonicalIdentityItem, "createdAt" | "id">,
): number {
  return (
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function offeringIds(item: CanonicalIdentityItem): string[] {
  return (
    item.externalProductIds ??
    (item.externalProductId === null ? [] : [item.externalProductId])
  );
}

function cloneItem(item: CanonicalIdentityItem): CanonicalIdentityItem {
  return {
    ...item,
    mealPeriods: [...item.mealPeriods],
    priceOptions: item.priceOptions.map((option) => ({ ...option })),
    externalProductIds: [...offeringIds(item)],
    activeExternalProductIds: [
      ...(item.activeExternalProductIds ??
        (item.isAvailable ? offeringIds(item) : [])),
    ],
    providerOfferings: item.providerOfferings.map((offering) => ({
      ...offering,
    })),
  };
}

/**
 * Plans identity changes without mutating persistence. The caller may evaluate
 * the returned projection first, then apply the audit/history writes in the
 * same transaction only after all normal menu safety checks pass.
 */
export function planCanonicalIdentityEvolution({
  sourceId,
  existingItems,
  projection,
}: PlanCanonicalIdentityEvolutionInput): CanonicalIdentityEvolution {
  const incoming = canonicalizeProviderOfferings(projection.items);
  const incomingByName = new Map(
    incoming.map((item) => [item.normalizedName, item]),
  );
  const incomingNameByProduct = new Map(
    incoming.flatMap((item) =>
      item.offerings.map(
        (offering) =>
          [offering.externalProductId, item.normalizedName] as const,
      ),
    ),
  );
  const managed = existingItems.filter(
    (item) => item.menuSourceId === sourceId,
  );
  const ownerByProduct = new Map(
    managed.flatMap((item) =>
      offeringIds(item).map((productId) => [productId, item] as const),
    ),
  );

  const anchorByItem = new Map<string, string>();
  for (const item of managed) {
    const identityNames = new Set(
      offeringIds(item)
        .map((productId) => incomingNameByProduct.get(productId))
        .filter((name): name is string => name !== undefined),
    );
    const retainsUnobservedCurrentAlias =
      projection.absenceAuthority.kind !== "provider-catalog" &&
      item.providerOfferings.some(
        (offering) =>
          offering.isAvailable &&
          offering.normalizedName === item.normalizedName &&
          !incomingNameByProduct.has(offering.externalProductId),
      );
    if (
      incomingByName.has(item.normalizedName) ||
      retainsUnobservedCurrentAlias
    ) {
      anchorByItem.set(item.id, item.normalizedName);
      continue;
    }
    if (identityNames.size === 0) {
      anchorByItem.set(item.id, item.normalizedName);
      continue;
    }
    if (identityNames.size === 1) {
      anchorByItem.set(item.id, [...identityNames][0]);
      continue;
    }
    if (identityNames.size > 1) {
      const anchor = [...item.providerOfferings]
        .filter((offering) =>
          incomingNameByProduct.has(offering.externalProductId),
        )
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.externalProductId.localeCompare(right.externalProductId),
        )
        .map((offering) =>
          incomingNameByProduct.get(offering.externalProductId),
        )
        .find((name): name is string => name !== undefined);
      if (anchor) anchorByItem.set(item.id, anchor);
    }
  }

  const candidatesByName = new Map<string, CanonicalIdentityItem[]>();
  for (const item of managed) {
    const anchor = anchorByItem.get(item.id);
    if (!anchor) continue;
    candidatesByName.set(anchor, [
      ...(candidatesByName.get(anchor) ?? []),
      item,
    ]);
  }

  const destinationByName = new Map<string, string>();
  const mergedInto = new Map<string, string>();
  const merges: CanonicalIdentityMerge[] = [];
  const canonicalNames = [
    ...new Set([...candidatesByName.keys(), ...incomingByName.keys()]),
  ].sort();
  for (const normalizedName of canonicalNames) {
    const candidates = [...(candidatesByName.get(normalizedName) ?? [])].sort(
      compareCreatedIdentity,
    );
    const survivor = candidates[0];
    if (!survivor) continue;
    destinationByName.set(normalizedName, survivor.id);
    const merged = candidates.slice(1);
    if (merged.length === 0) continue;
    for (const candidate of merged) mergedInto.set(candidate.id, survivor.id);
    merges.push({
      survivorItemId: survivor.id,
      mergedItemIds: merged.map((candidate) => candidate.id),
      normalizedName,
      externalProductIds: [...new Set(candidates.flatMap(offeringIds))].sort(),
    });
  }

  const projectedById = new Map(
    existingItems
      .filter((item) => !mergedInto.has(item.id))
      .map((item) => [item.id, cloneItem(item)]),
  );
  for (const merge of merges) {
    const survivor = projectedById.get(merge.survivorItemId)!;
    const mergedItems = merge.mergedItemIds
      .map((id) => existingItems.find((item) => item.id === id))
      .filter((item): item is CanonicalIdentityItem => item !== undefined);
    survivor.providerOfferings = [
      ...survivor.providerOfferings,
      ...mergedItems.flatMap((item) => item.providerOfferings),
    ].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.externalProductId.localeCompare(right.externalProductId),
    );
    survivor.externalProductIds = merge.externalProductIds;
    survivor.activeExternalProductIds = [
      ...new Set(
        [survivor, ...mergedItems].flatMap(
          (item) =>
            item.activeExternalProductIds ??
            (item.isAvailable ? offeringIds(item) : []),
        ),
      ),
    ].sort();
    survivor.externalProductId = survivor.externalProductIds[0] ?? null;
    survivor.isAvailable = survivor.activeExternalProductIds.length > 0;
  }

  const splitGroups = new Map<string, CanonicalIdentitySplit>();
  for (const item of incoming) {
    const destinationItemId =
      destinationByName.get(item.normalizedName) ?? null;
    for (const incomingOffering of item.offerings) {
      const originalOwner = ownerByProduct.get(
        incomingOffering.externalProductId,
      );
      if (!originalOwner) continue;
      const finalOwnerId = mergedInto.get(originalOwner.id) ?? originalOwner.id;
      if (anchorByItem.get(originalOwner.id) === item.normalizedName) continue;
      const source = projectedById.get(finalOwnerId);
      if (!source || finalOwnerId === destinationItemId) continue;
      const key = `${finalOwnerId}\u0000${destinationItemId ?? ""}\u0000${item.normalizedName}`;
      const split = splitGroups.get(key) ?? {
        sourceItemId: finalOwnerId,
        targetItemId: destinationItemId,
        fromNormalizedName: source.normalizedName,
        toNormalizedName: item.normalizedName,
        externalProductIds: [],
      };
      split.externalProductIds.push(incomingOffering.externalProductId);
      splitGroups.set(key, split);

      source.externalProductIds = offeringIds(source).filter(
        (id) => id !== incomingOffering.externalProductId,
      );
      source.activeExternalProductIds = (
        source.activeExternalProductIds ?? []
      ).filter((id) => id !== incomingOffering.externalProductId);
      const [movedOffering] = source.providerOfferings.filter(
        (offering) =>
          offering.externalProductId === incomingOffering.externalProductId,
      );
      source.providerOfferings = source.providerOfferings.filter(
        (offering) =>
          offering.externalProductId !== incomingOffering.externalProductId,
      );
      source.externalProductId = source.externalProductIds[0] ?? null;
      source.isAvailable = source.activeExternalProductIds.length > 0;

      if (destinationItemId && movedOffering) {
        const destination = projectedById.get(destinationItemId)!;
        destination.providerOfferings.push(movedOffering);
        destination.externalProductIds = [
          ...new Set([
            ...offeringIds(destination),
            incomingOffering.externalProductId,
          ]),
        ].sort();
        if (movedOffering.isAvailable) {
          destination.activeExternalProductIds = [
            ...new Set([
              ...(destination.activeExternalProductIds ?? []),
              incomingOffering.externalProductId,
            ]),
          ].sort();
        }
      }
    }
  }

  const splits = [...splitGroups.values()]
    .map((split) => ({
      ...split,
      externalProductIds: [...new Set(split.externalProductIds)].sort(),
    }))
    .sort(
      (left, right) =>
        left.sourceItemId.localeCompare(right.sourceItemId) ||
        left.toNormalizedName.localeCompare(right.toNormalizedName),
    );
  const renames = managed
    .filter((item) => !mergedInto.has(item.id))
    .flatMap((item) => {
      const anchor = anchorByItem.get(item.id);
      if (!anchor || anchor === item.normalizedName) return [];
      return [
        {
          itemId: mergedInto.get(item.id) ?? item.id,
          fromNormalizedName: item.normalizedName,
          toNormalizedName: anchor,
          externalProductIds: offeringIds(item)
            .filter(
              (productId) => incomingNameByProduct.get(productId) === anchor,
            )
            .sort(),
        },
      ];
    })
    .filter(
      (rename, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.itemId === rename.itemId &&
            candidate.toNormalizedName === rename.toNormalizedName,
        ) === index,
    )
    .sort((left, right) => left.itemId.localeCompare(right.itemId));

  for (const item of projectedById.values()) {
    item.externalProductIds = [...new Set(offeringIds(item))].sort();
    item.activeExternalProductIds = [
      ...new Set(item.activeExternalProductIds ?? []),
    ].sort();
    item.externalProductId = item.externalProductIds[0] ?? null;
  }

  return {
    projectedItems: [...projectedById.values()],
    renames,
    splits,
    merges,
  };
}
