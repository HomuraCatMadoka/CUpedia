import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "@/lib/canteen-aigens-parse";
import type { MenuSyncInput } from "./canteen-types";

const EXCLUDED_CATEGORIES = new Set(["飲品", "零食", "外賣包裝"]);

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const items = assignMealPeriodSortOrder(
    products.map((product) => ({
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
    })),
    (item) => item.mealPeriods,
  );

  return {
    source: "aigens:102830",
    takeOverLegacyItems: true,
    items,
  };
}
