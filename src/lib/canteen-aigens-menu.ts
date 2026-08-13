import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "@/lib/canteen-aigens-parse";
import { createAigensOfferingId } from "@/lib/canteen-menu-external-key";
import { assertProviderMenuIdentityItems } from "./canteen-provider-menu-identity";
import type { MenuSyncInput } from "./canteen-types";

const EXCLUDED_CATEGORIES = new Set(["飲品", "零食", "外賣包裝"]);

export function buildAigensMenuSyncPayload(input: unknown): MenuSyncInput {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const items = assignMealPeriodSortOrder(
    products.map((product) => ({
      externalProductId: createAigensOfferingId(
        product.backendId,
        product.periods[0],
      ),
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

  assertProviderMenuIdentityItems("aigens", items);

  return {
    takeOverLegacyItems: false,
    items,
  };
}

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  return buildAigensMenuSyncPayload(input);
}
