import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "@/lib/canteen-aigens-parse";
import { assertProviderMenuIdentityItems } from "./canteen-provider-menu-identity";
import { expectedMenuSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";
import { sortMenuProviderOccurrences } from "./canteen-types";
import type {
  MenuSnapshotScopeEvidence,
  MenuSyncInput,
  ProviderMenuObservation,
} from "./canteen-types";

const EXCLUDED_CATEGORIES = new Set(["飲品", "零食", "外賣包裝"]);

export function buildAigensMenuSyncPayload(
  input: unknown,
  scopeEvidence?: MenuSnapshotScopeEvidence,
): ProviderMenuObservation {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const items = assignMealPeriodSortOrder(
    products.map((product) => ({
      externalProductId: product.backendId,
      name: product.name,
      priceOptions: product.priceOptions,
      mealPeriods: product.periods,
      sortOrder: 0,
      svgKey: product.svgKey,
      occurrences: product.occurrences,
    })),
    (item) => item.mealPeriods,
  );

  for (const item of items) {
    item.occurrences = sortMenuProviderOccurrences(item.occurrences);
  }

  assertProviderMenuIdentityItems("aigens", items);

  return {
    snapshotCompleteness: expectedMenuSnapshotCompleteness("aigens"),
    items,
    ...(scopeEvidence ? { scopeEvidence } : {}),
  };
}

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  return {
    ...buildAigensMenuSyncPayload(input),
    takeOverLegacyItems: false,
  };
}
