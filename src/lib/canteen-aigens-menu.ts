import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "@/lib/canteen-aigens-parse";
import type { MenuSyncInput } from "./canteen-types";

const EXCLUDED_CATEGORIES = new Set(["飲品", "零食", "外賣包裝"]);

export function buildAigensMenuSyncPayload(
  input: unknown,
  externalStoreId: string,
): MenuSyncInput {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const items = assignMealPeriodSortOrder(
    products.map((product) => ({
      externalKey: `${product.backendId}:${[...product.periods].sort().at(0) ?? "allday"}`,
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
    source: `aigens:${externalStoreId}`,
    takeOverLegacyItems: true,
    items,
  };
}

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  return buildAigensMenuSyncPayload(input, "102830");
}
