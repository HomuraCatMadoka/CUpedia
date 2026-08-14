import { resolveMenuSectionKey } from "@/lib/canteen-svg-keys";
import { createAigensOfferingId } from "./canteen-menu-external-key";
import { assertProviderMenuIdentityItems } from "./canteen-provider-menu-identity";
import {
  ALLDAY_MEAL_PERIOD,
  primaryMealPeriodSortKey,
  type MealPeriod,
  type MealPeriodAssignment,
  type MenuItemPriceOptionInput,
} from "@/lib/canteen-types";

export type AigensItem = {
  backendId?: string;
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
  priceOptions: MenuItemPriceOptionInput[];
  periods: MealPeriodAssignment[];
  svgKey: string;
};

type AigensAggregatedProduct = Omit<AigensParsedProduct, "priceOptions"> & {
  priceContexts: Array<{ label: string; amountMinor: number }>;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function materializePriceOptions(
  contexts: readonly { label: string; amountMinor: number }[],
): MenuItemPriceOptionInput[] {
  const labelByAmount = new Map<number, string>();
  for (const context of contexts) {
    const current = labelByAmount.get(context.amountMinor);
    if (current === undefined || context.label < current) {
      labelByAmount.set(context.amountMinor, context.label);
    }
  }
  const distinctPrices = [...labelByAmount.entries()]
    .map(([amountMinor, label]) => ({ label, amountMinor }))
    .sort(
      (left, right) =>
        compareText(left.label, right.label) ||
        left.amountMinor - right.amountMinor,
    );
  return distinctPrices.map((context, sortOrder) => ({
    label: distinctPrices.length === 1 ? null : context.label,
    amountMinor: context.amountMinor,
    currency: "HKD",
    sortOrder,
  }));
}

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
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_AIGENS_MENU");
  }
  const data = (input as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("INVALID_AIGENS_MENU");
  }
  const menu = (data as Record<string, unknown>).menu;
  if (!menu || typeof menu !== "object" || Array.isArray(menu)) {
    throw new Error("INVALID_AIGENS_MENU");
  }
  const categories = (menu as Record<string, unknown>).categories;
  const groups = (menu as Record<string, unknown>).groups;
  if (!Array.isArray(categories) || !Array.isArray(groups)) {
    throw new Error("INVALID_AIGENS_MENU");
  }

  if (
    !categories.every(
      (category): category is AigensCategory =>
        Boolean(category) &&
        typeof category === "object" &&
        !Array.isArray(category) &&
        (category.name === undefined || typeof category.name === "string") &&
        (category.periods === undefined ||
          (Array.isArray(category.periods) &&
            category.periods.every(
              (value: unknown) => typeof value === "string",
            ))) &&
        (category.groupIds === undefined ||
          (Array.isArray(category.groupIds) &&
            category.groupIds.every(
              (value: unknown) => typeof value === "string",
            ))),
    ) ||
    !groups.every(
      (group): group is AigensGroup =>
        Boolean(group) &&
        typeof group === "object" &&
        !Array.isArray(group) &&
        (group.id === undefined || typeof group.id === "string") &&
        (group.items === undefined ||
          (Array.isArray(group.items) &&
            group.items.every(
              (item: unknown) =>
                Boolean(item) &&
                typeof item === "object" &&
                !Array.isArray(item),
            ))),
    )
  ) {
    throw new Error("INVALID_AIGENS_MENU");
  }

  const groupsById = new Map(
    groups.filter((group) => group.id).map((group) => [group.id!, group]),
  );
  const products: AigensAggregatedProduct[] = [];
  const seen = new Map<string, AigensAggregatedProduct>();
  const validatedGroupIds = new Set<string>();

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

    if (!validatedGroupIds.has(primaryGroup.id!)) {
      const groupItems = primaryGroup.items.filter(
        (item) => !isSkippableItem(item),
      );
      assertProviderMenuIdentityItems(
        "aigens",
        groupItems.map((item) => {
          const backendId = String(item.backendId ?? "").trim();
          return {
            externalProductId: backendId
              ? createAigensOfferingId(backendId, ALLDAY_MEAL_PERIOD)
              : "",
            name: item.name!.trim().replace(/\s+/g, " "),
            amountMinor: parseAigensPrice(item.price),
          };
        }),
      );
      validatedGroupIds.add(primaryGroup.id!);
    }

    for (const item of primaryGroup.items) {
      if (isSkippableItem(item)) continue;
      const backendId = String(item.backendId ?? "").trim();
      assertProviderMenuIdentityItems("aigens", [
        {
          externalProductId: backendId
            ? createAigensOfferingId(backendId, periods[0])
            : "",
        },
      ]);
      const name = item.name!.trim().replace(/\s+/g, " ");
      const amountMinor = parseAigensPrice(item.price);
      const svgKey = resolveMenuSectionKey({
        categoryName: category.name,
        dishName: name,
      });

      for (const mealPeriod of periods) {
        const dedupeKey = createAigensOfferingId(backendId, mealPeriod);
        const product = {
          backendId,
          name,
          categoryName: category.name,
          priceContexts: [{ label: svgKey, amountMinor }],
          periods: [mealPeriod],
          svgKey,
        } satisfies AigensAggregatedProduct;
        const existing = seen.get(dedupeKey);
        if (existing) {
          if (existing.name !== name) {
            assertProviderMenuIdentityItems("aigens", [
              { externalProductId: dedupeKey, name: existing.name },
              { externalProductId: dedupeKey, name },
            ]);
          }
          const sameContext = existing.priceContexts.find(
            (context) => context.label === svgKey,
          );
          if (sameContext) {
            if (sameContext.amountMinor !== amountMinor) {
              assertProviderMenuIdentityItems("aigens", [
                {
                  externalProductId: dedupeKey,
                  name,
                  priceOptions: [sameContext],
                },
                {
                  externalProductId: dedupeKey,
                  name,
                  priceOptions: [{ label: svgKey, amountMinor }],
                },
              ]);
            }
          } else {
            existing.priceContexts.push({ label: svgKey, amountMinor });
          }
          if (svgKey < existing.svgKey) {
            existing.categoryName = category.name;
            existing.svgKey = svgKey;
          }
          continue;
        }
        seen.set(dedupeKey, product);
        products.push(product);
      }
    }
  }

  return products.map(({ priceContexts, ...product }) => ({
    ...product,
    priceOptions: materializePriceOptions(priceContexts),
  }));
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
  const sorted = items
    .slice()
    .sort(
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
