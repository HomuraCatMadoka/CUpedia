import type { MealPeriodAssignment } from "@/lib/canteen-types";

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
  const match = externalProductId.match(
    /^(.*)#offering-period=(breakfast|lunch|dinner|allday)$/,
  );
  return match?.[1] || null;
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

/** Product portion used only for unambiguous period-change reconciliation. */
export function menuExternalProductIdentity(externalKey: string): string {
  const marker = externalKey.lastIndexOf(PERIOD_MARKER);
  return marker === -1 ? externalKey : externalKey.slice(0, marker);
}
