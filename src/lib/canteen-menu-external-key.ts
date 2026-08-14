import { MEAL_PERIOD_VALUES, type MealPeriodAssignment } from "./canteen-types";

const PERIOD_MARKER = "#period=";
const AIGENS_OFFERING_PERIOD_MARKER = "#offering-period=";

export function createAigensOfferingId(
  productId: string,
  mealPeriod: MealPeriodAssignment,
): string {
  const identity = productId.trim();
  if (!identity || identity.includes(AIGENS_OFFERING_PERIOD_MARKER)) {
    throw new Error("INVALID_AIGENS_OFFERING_ID");
  }
  return `${identity}${AIGENS_OFFERING_PERIOD_MARKER}${mealPeriod}`;
}

export function aigensOfferingProductIdentity(
  externalProductId: string,
): string | null {
  return parseAigensOfferingId(externalProductId)?.productId ?? null;
}

export function parseAigensOfferingId(externalProductId: string): {
  productId: string;
  mealPeriod: MealPeriodAssignment;
} | null {
  const markerIndex = externalProductId.lastIndexOf(
    AIGENS_OFFERING_PERIOD_MARKER,
  );
  if (
    markerIndex <= 0 ||
    externalProductId.indexOf(AIGENS_OFFERING_PERIOD_MARKER) !== markerIndex
  ) {
    return null;
  }
  const productId = externalProductId.slice(0, markerIndex);
  const mealPeriod = externalProductId.slice(
    markerIndex + AIGENS_OFFERING_PERIOD_MARKER.length,
  );
  return isMealPeriodAssignment(mealPeriod) ? { productId, mealPeriod } : null;
}

export type OfferingIdentityTransition = {
  productIdentity: string;
  previousProductIds: string[];
  nextProductIds: string[];
};

/**
 * Classify unmatched period-scoped Aigens IDs after exact IDs are removed.
 * Only a residual one-to-one pair is safe to move in place.
 */
export function reconcileOfferingIdentityTransitions(
  previousProductIds: readonly string[],
  nextProductIds: readonly string[],
): {
  safeMoves: Array<{ previousProductId: string; nextProductId: string }>;
  ambiguousTransitions: OfferingIdentityTransition[];
} {
  const previousSet = new Set(previousProductIds);
  const nextSet = new Set(nextProductIds);
  const previousByIdentity = groupUnmatchedAigensOfferings(
    previousProductIds.filter((id) => !nextSet.has(id)),
  );
  const nextByIdentity = groupUnmatchedAigensOfferings(
    nextProductIds.filter((id) => !previousSet.has(id)),
  );
  const safeMoves: Array<{
    previousProductId: string;
    nextProductId: string;
  }> = [];
  const ambiguousTransitions: OfferingIdentityTransition[] = [];

  for (const productIdentity of new Set([
    ...previousByIdentity.keys(),
    ...nextByIdentity.keys(),
  ])) {
    const previous = previousByIdentity.get(productIdentity) ?? [];
    const next = nextByIdentity.get(productIdentity) ?? [];
    if (previous.length === 0 || next.length === 0) continue;
    if (previous.length === 1 && next.length === 1) {
      safeMoves.push({
        previousProductId: previous[0],
        nextProductId: next[0],
      });
      continue;
    }
    ambiguousTransitions.push({
      productIdentity,
      previousProductIds: previous,
      nextProductIds: next,
    });
  }

  return { safeMoves, ambiguousTransitions };
}

function groupUnmatchedAigensOfferings(
  externalProductIds: readonly string[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const externalProductId of externalProductIds) {
    const productIdentity = aigensOfferingProductIdentity(externalProductId);
    if (!productIdentity) continue;
    grouped.set(productIdentity, [
      ...(grouped.get(productIdentity) ?? []),
      externalProductId,
    ]);
  }
  return grouped;
}

/** Stable upstream product identity plus its current CUpedia period set. */
export function createMenuExternalKey(
  productId: string,
  mealPeriods: readonly MealPeriodAssignment[],
): string {
  const identity = productId.trim();
  if (!identity || identity.includes(PERIOD_MARKER)) {
    throw new Error("INVALID_EXTERNAL_KEY");
  }
  return `${identity}${PERIOD_MARKER}${[...mealPeriods].sort().join("+")}`;
}

export function parseMenuExternalKey(externalKey: string): {
  productIdentity: string;
  mealPeriods: MealPeriodAssignment[];
} | null {
  const markerIndex = externalKey.lastIndexOf(PERIOD_MARKER);
  if (markerIndex <= 0 || externalKey.indexOf(PERIOD_MARKER) !== markerIndex) {
    return null;
  }
  const productIdentity = externalKey.slice(0, markerIndex);
  const mealPeriods = externalKey
    .slice(markerIndex + PERIOD_MARKER.length)
    .split("+");
  if (!mealPeriods.every(isMealPeriodAssignment)) return null;
  if (createMenuExternalKey(productIdentity, mealPeriods) !== externalKey) {
    return null;
  }
  return { productIdentity, mealPeriods };
}

/** Product portion used only for unambiguous period-change reconciliation. */
export function menuExternalProductIdentity(externalKey: string): string {
  const marker = externalKey.lastIndexOf(PERIOD_MARKER);
  return marker === -1 ? externalKey : externalKey.slice(0, marker);
}

function isMealPeriodAssignment(value: unknown): value is MealPeriodAssignment {
  return (MEAL_PERIOD_VALUES as readonly unknown[]).includes(value);
}
