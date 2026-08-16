import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "@/lib/canteen-aigens-parse";
import { createAigensOfferingId } from "@/lib/canteen-menu-external-key";
import { assertProviderMenuIdentityItems } from "./canteen-provider-menu-identity";
import { expectedMenuSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";
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
      priceOptions: product.priceOptions,
      mealPeriods: product.periods,
      sortOrder: 0,
      svgKey: product.svgKey,
    })),
    (item) => item.mealPeriods,
  );

  assertProviderMenuIdentityItems("aigens", items);

  return {
    snapshotCompleteness: expectedMenuSnapshotCompleteness("aigens"),
    takeOverLegacyItems: false,
    items,
  };
}

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  return buildAigensMenuSyncPayload(input);
}
