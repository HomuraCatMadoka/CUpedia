import {
  ALLDAY_MEAL_PERIOD,
  MEAL_PERIODS,
  MEAL_PERIOD_VALUES,
  type MealPeriod,
  type MealPeriodAssignment,
} from "@/db/schema";
import type { CanteenMenuItem } from "@/lib/canteen-types";

export { ALLDAY_MEAL_PERIOD, MEAL_PERIOD_VALUES, type MealPeriodAssignment };

const ASSIGNMENT_ORDER: Record<MealPeriodAssignment, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  allday: 3,
};

export function compareMealPeriodAssignments(
  a: MealPeriodAssignment,
  b: MealPeriodAssignment,
): number {
  return ASSIGNMENT_ORDER[a] - ASSIGNMENT_ORDER[b];
}

/** Sort key for menu items: earliest specific period, else allday last. */
export function primaryMealPeriodSortKey(
  periods: readonly MealPeriodAssignment[],
): number {
  if (periods.length === 0) return ASSIGNMENT_ORDER.allday;
  return Math.min(...periods.map((p) => ASSIGNMENT_ORDER[p]));
}

function isAssignment(value: string): value is MealPeriodAssignment {
  return (MEAL_PERIOD_VALUES as readonly string[]).includes(value);
}

/**
 * Normalize meal-period input to a non-empty assignment list.
 * Missing/empty → `["allday"]`. If `allday` is present (alone or with others) → `["allday"]`.
 * Returns null when input contains unknown values (caller may throw).
 */
export function normalizeMealPeriods(
  input: unknown,
): MealPeriodAssignment[] | null {
  if (input == null || input === "") {
    return [ALLDAY_MEAL_PERIOD];
  }

  let raw: unknown[];
  if (typeof input === "string") {
    raw = [input];
  } else if (Array.isArray(input)) {
    raw = input;
  } else {
    return null;
  }

  if (raw.length === 0) return [ALLDAY_MEAL_PERIOD];

  const seen = new Set<MealPeriodAssignment>();
  for (const entry of raw) {
    if (typeof entry !== "string" || !isAssignment(entry)) return null;
    seen.add(entry);
  }

  if (seen.has(ALLDAY_MEAL_PERIOD)) {
    return [ALLDAY_MEAL_PERIOD];
  }

  const ordered = MEAL_PERIODS.filter((p) => seen.has(p));
  return ordered.length > 0 ? [...ordered] : [ALLDAY_MEAL_PERIOD];
}

/** Parse a single legacy tab period string (breakfast|lunch|dinner). */
export function parseMealPeriod(value: string): MealPeriod | null {
  return (MEAL_PERIODS as readonly string[]).includes(value)
    ? (value as MealPeriod)
    : null;
}

export function itemHasAllDay(
  periods: readonly MealPeriodAssignment[],
): boolean {
  return periods.includes(ALLDAY_MEAL_PERIOD);
}

export function itemMatchesMealPeriod(
  periods: readonly MealPeriodAssignment[],
  period: MealPeriod,
): boolean {
  return itemHasAllDay(periods) || periods.includes(period);
}

/**
 * Visible tabs from *specific* periods only. All-day does not create tabs.
 * Empty → hide period chrome and show the full list.
 */
export function availableMealPeriods(
  items: ReadonlyArray<{ mealPeriods: readonly MealPeriodAssignment[] }>,
): MealPeriod[] {
  const present = new Set<MealPeriod>();
  for (const item of items) {
    for (const period of item.mealPeriods) {
      if ((MEAL_PERIODS as readonly string[]).includes(period)) {
        present.add(period as MealPeriod);
      }
    }
  }
  return MEAL_PERIODS.filter((period) => present.has(period));
}

export function filterItemsByMealPeriod(
  items: CanteenMenuItem[],
  period: MealPeriod,
): CanteenMenuItem[] {
  return items.filter((item) =>
    itemMatchesMealPeriod(item.mealPeriods, period),
  );
}

/**
 * Resolve periods from API/JSON row: prefer `mealPeriods`, fall back to scalar
 * `mealPeriod`, default allday when both missing.
 */
export function mealPeriodsFromRow(
  row: Record<string, unknown>,
): MealPeriodAssignment[] | null {
  if ("mealPeriods" in row && row.mealPeriods !== undefined) {
    return normalizeMealPeriods(row.mealPeriods);
  }
  if (
    "mealPeriod" in row &&
    row.mealPeriod !== undefined &&
    row.mealPeriod !== null
  ) {
    return normalizeMealPeriods(row.mealPeriod);
  }
  return normalizeMealPeriods(undefined);
}
