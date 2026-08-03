import { parseAigensMenuProducts } from "@/lib/canteen-aigens-parse";
import {
  primaryMealPeriodSortKey,
  type MenuSyncInput,
} from "./canteen-types";

const EXCLUDED_CATEGORIES = new Set(["飲品", "零食", "外賣包裝"]);

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const sortedItems: MenuSyncInput["items"] = products
    .map((product) => ({
      externalKey: `${product.backendId}:${product.periods[0]}`,
      name: product.name,
      priceOptions: [
        {
          label: null,
          amountMinor: product.amountMinor,
          currency: "HKD" as const,
          sortOrder: 0,
        },
      ],
      mealPeriods: product.periods,
      sortOrder: 0,
      svgKey: product.svgKey,
    }))
    .sort(
      (a, b) =>
        primaryMealPeriodSortKey(a.mealPeriods) -
          primaryMealPeriodSortKey(b.mealPeriods) ||
        a.name.localeCompare(b.name, "zh-HK"),
    );

  sortedItems.forEach((item, index) => {
    item.sortOrder = index;
  });

  return {
    source: "aigens:102830",
    takeOverLegacyItems: true,
    items: sortedItems,
  };
}
