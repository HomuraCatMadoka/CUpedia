import { resolveMenuSectionKey } from "@/lib/canteen-svg-keys";
import {
  ALLDAY_MEAL_PERIOD,
  primaryMealPeriodSortKey,
  type MealPeriod,
  type MealPeriodAssignment,
} from "@/lib/canteen-types";

export type AigensItem = {
  backendId?: string;
  id?: string;
  name?: string;
  price?: number;
  published?: boolean;
  archived?: boolean;
  modifier?: boolean;
};

export type AigensGroup = {
  id?: string;
  items?: AigensItem[];
};

export type AigensCategory = {
  name?: string;
  periods?: string[];
  groupIds?: string[];
};

const PERIOD_MAP: Record<string, MealPeriod | undefined> = {
  B: "breakfast",
  L: "lunch",
  T: "lunch",
  D: "dinner",
};

/** One store product expanded across mapped meal periods. */
export type AigensParsedProduct = {
  backendId: string;
  name: string;
  categoryName: string;
  amountMinor: number;
  periods: MealPeriodAssignment[];
  svgKey: string;
};

export function parseAigensPrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("INVALID_AIGENS_PRICE");
  }
  const amountMinor = Math.round(price * 100);
  if (amountMinor > 999_900) throw new Error("INVALID_AIGENS_PRICE");
  return amountMinor;
}

function isSkippableItem(item: AigensItem): boolean {
  return (
    item.published === false ||
    item.archived === true ||
    item.modifier === true ||
    !item.name
  );
}

/**
 * Walk Aigens menu categories/groups into normalized products.
 * Callers choose excluded categories and map to sync/script output shapes.
 */
export function parseAigensMenuProducts(
  input: unknown,
  options: { excludedCategories: ReadonlySet<string> },
): AigensParsedProduct[] {
  const root = input as {
    data?: { menu?: { categories?: AigensCategory[]; groups?: AigensGroup[] } };
  };
  const categories = root?.data?.menu?.categories;
  const groups = root?.data?.menu?.groups;
  if (!Array.isArray(categories) || !Array.isArray(groups)) {
    throw new Error("INVALID_AIGENS_MENU");
  }

  const groupsById = new Map(
    groups.filter((group) => group.id).map((group) => [group.id!, group]),
  );
  const products: AigensParsedProduct[] = [];
  const seen = new Set<string>();

  for (const category of categories) {
    if (!category.name || options.excludedCategories.has(category.name)) {
      continue;
    }
    const primaryGroup = category.groupIds?.[0]
      ? groupsById.get(category.groupIds[0])
      : undefined;
    if (!primaryGroup?.items) continue;

    const mappedPeriods = [
      ...new Set(
        (category.periods ?? [])
          .map((period) => PERIOD_MAP[period])
          .filter((period): period is MealPeriod => period !== undefined),
      ),
    ];
    const periods: MealPeriodAssignment[] =
      mappedPeriods.length > 0 ? mappedPeriods : [ALLDAY_MEAL_PERIOD];

    for (const item of primaryGroup.items) {
      if (isSkippableItem(item)) continue;
      const backendId = String(item.backendId ?? item.id ?? "").trim();
      if (!backendId) continue;
      const name = item.name!.trim().replace(/\s+/g, " ");
      const amountMinor = parseAigensPrice(item.price);
      const svgKey = resolveMenuSectionKey({
        categoryName: category.name,
        dishName: name,
      });

      for (const mealPeriod of periods) {
        const dedupeKey = `${backendId}:${mealPeriod}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        products.push({
          backendId,
          name,
          categoryName: category.name,
          amountMinor,
          periods: [mealPeriod],
          svgKey,
        });
      }
    }
  }

  return products;
}

/**
 * Sort by primary meal period then zh-HK name, then assign sequential sortOrder.
 */
export function assignMealPeriodSortOrder<
  T extends { name: string; sortOrder: number },
>(
  items: T[],
  mealPeriodsOf: (item: T) => readonly MealPeriodAssignment[],
): T[] {
  const sorted = items.slice().sort(
    (a, b) =>
      primaryMealPeriodSortKey(mealPeriodsOf(a)) -
        primaryMealPeriodSortKey(mealPeriodsOf(b)) ||
      a.name.localeCompare(b.name, "zh-HK"),
  );
  sorted.forEach((item, index) => {
    item.sortOrder = index;
  });
  return sorted;
}
