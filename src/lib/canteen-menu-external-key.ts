import type { MealPeriodAssignment } from "@/lib/canteen-types";

const PERIOD_MARKER = "#period=";

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
