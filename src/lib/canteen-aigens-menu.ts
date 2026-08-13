import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "@/lib/canteen-aigens-parse";
import type { MenuSyncInput } from "./canteen-types";

const EXCLUDED_CATEGORIES = new Set(["飲品", "零食", "外賣包裝"]);

export function buildAigensMenuSyncPayload(input: unknown): MenuSyncInput {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const byProductId = new Map<
    string,
    (typeof products)[number] & {
      periods: (typeof products)[number]["periods"];
    }
  >();
  for (const product of products) {
    const existing = byProductId.get(product.backendId);
    if (existing) {
      existing.periods = [
        ...new Set([...existing.periods, ...product.periods]),
      ];
      continue;
    }
    byProductId.set(product.backendId, { ...product });
  }

  const items = assignMealPeriodSortOrder(
    [...byProductId.values()].map((product) => ({
      externalProductId: product.backendId,
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
    takeOverLegacyItems: false,
    items,
  };
}

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  return buildAigensMenuSyncPayload(input);
}
