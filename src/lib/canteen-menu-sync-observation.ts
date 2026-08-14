import {
  reconcileOfferingIdentityTransitions,
  type OfferingIdentityTransition,
} from "@/lib/canteen-menu-external-key";

export type MenuIdentityObservation = {
  newProductCount: number;
  missingProductCount: number;
  newProductIds: string[];
  missingProductIds: string[];
  suspectedReplacements: Array<{
    previousProductId: string;
    nextProductId: string;
    normalizedName: string;
  }>;
  ambiguousOfferingTransitions: OfferingIdentityTransition[];
  truncated: boolean;
};

const OBSERVATION_ID_LIMIT = 25;
const MIN_CHURN_COUNT = 3;
const CHURN_RATIO_PERCENT = 25;

function normalizedName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function observeMenuIdentityChurn(
  existing: Array<{ externalProductId: string; name: string }>,
  incoming: Array<{ externalProductId: string; name: string }>,
): MenuIdentityObservation {
  const existingIds = new Set(existing.map((item) => item.externalProductId));
  const incomingIds = new Set(incoming.map((item) => item.externalProductId));
  const offeringTransitions = reconcileOfferingIdentityTransitions(
    [...existingIds],
    [...incomingIds],
  );
  const safelyMovedPreviousIds = new Set(
    offeringTransitions.safeMoves.map((move) => move.previousProductId),
  );
  const safelyMovedNextIds = new Set(
    offeringTransitions.safeMoves.map((move) => move.nextProductId),
  );
  const newItems = incoming.filter(
    (item) =>
      !existingIds.has(item.externalProductId) &&
      !safelyMovedNextIds.has(item.externalProductId),
  );
  const missingItems = existing.filter(
    (item) =>
      !incomingIds.has(item.externalProductId) &&
      !safelyMovedPreviousIds.has(item.externalProductId),
  );
  const newByName = new Map<string, typeof newItems>();
  const missingByName = new Map<string, typeof missingItems>();
  for (const item of newItems) {
    const key = normalizedName(item.name);
    newByName.set(key, [...(newByName.get(key) ?? []), item]);
  }
  for (const item of missingItems) {
    const key = normalizedName(item.name);
    missingByName.set(key, [...(missingByName.get(key) ?? []), item]);
  }
  const suspectedReplacements: MenuIdentityObservation["suspectedReplacements"] =
    [];
  for (const [name, previous] of missingByName) {
    const next = newByName.get(name) ?? [];
    if (previous.length === 1 && next.length === 1) {
      suspectedReplacements.push({
        previousProductId: previous[0].externalProductId,
        nextProductId: next[0].externalProductId,
        normalizedName: name,
      });
    }
  }
  return {
    newProductCount: newItems.length,
    missingProductCount: missingItems.length,
    newProductIds: newItems
      .slice(0, OBSERVATION_ID_LIMIT)
      .map((item) => item.externalProductId),
    missingProductIds: missingItems
      .slice(0, OBSERVATION_ID_LIMIT)
      .map((item) => item.externalProductId),
    suspectedReplacements: suspectedReplacements.slice(0, OBSERVATION_ID_LIMIT),
    ambiguousOfferingTransitions:
      offeringTransitions.ambiguousTransitions.slice(0, OBSERVATION_ID_LIMIT),
    truncated:
      newItems.length > OBSERVATION_ID_LIMIT ||
      missingItems.length > OBSERVATION_ID_LIMIT ||
      suspectedReplacements.length > OBSERVATION_ID_LIMIT ||
      offeringTransitions.ambiguousTransitions.length > OBSERVATION_ID_LIMIT,
  };
}

export function isSuspiciousMenuIdentityChurn(
  observation: MenuIdentityObservation,
  existingCount: number,
): boolean {
  const changed = Math.max(
    observation.newProductCount,
    observation.missingProductCount,
  );
  return (
    observation.suspectedReplacements.length > 0 ||
    observation.ambiguousOfferingTransitions.length > 0 ||
    (changed >= MIN_CHURN_COUNT &&
      changed * 100 >= existingCount * CHURN_RATIO_PERCENT)
  );
}
