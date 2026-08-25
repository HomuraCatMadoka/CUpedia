import { assignMealPeriodSortOrder } from "@/lib/canteen-aigens-parse";
import { mealPeriodsForOperatingWindow } from "@/lib/canteen-provider-menu-periods";
import {
  assertProviderMenuIdentityItems,
  ProviderMenuIdentityError,
} from "./canteen-provider-menu-identity";
import { compareProviderText } from "./canteen-provider-menu-ordering";
import { expectedMenuSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";
import { resolveMenuSectionKey } from "@/lib/canteen-svg-keys";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  ProviderMenuObservation,
} from "@/lib/canteen-types";
import { normalizeMealPeriods } from "@/lib/canteen-types";

const ICHEF_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IchefMenuHour = {
  startTime?: string;
  endTime?: string;
  categorySnapshotUuids?: string[];
};

type IchefMenuItem = {
  uuid?: string;
  ichefUuid?: string;
  name?: string;
  price?: number;
};

type IchefCategory = {
  uuid?: string;
  name?: string;
  menuItemsSnapshot?: IchefMenuItem[];
};

function parseAmountMinor(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("INVALID_ICHEF_PRICE");
  }
  const amountMinor = Math.round(price * 100);
  if (amountMinor > 999_900) throw new Error("INVALID_ICHEF_PRICE");
  return amountMinor;
}

/** iCHEF exposes this field as a GraphQL UUID, not an arbitrary string ID. */
export function isIchefProductUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    ICHEF_UUID_PATTERN.test(value)
  );
}

function assertIchefProductUuid(value: string): void {
  if (isIchefProductUuid(value)) return;
  throw new ProviderMenuIdentityError("MALFORMED_IDENTITY", {
    provider: "ichef",
    count: 1,
    samples: [],
  });
}

function samePriceOptions(
  left: readonly MenuItemPriceOptionInput[],
  right: readonly MenuItemPriceOptionInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (option, index) =>
        option.label === right[index].label &&
        option.amountMinor === right[index].amountMinor &&
        option.currency === right[index].currency,
    )
  );
}

export function buildIchefMenuSyncPayload(
  menuHours: IchefMenuHour[],
  categories: IchefCategory[],
): ProviderMenuObservation {
  const periodsByCategory = new Map<string, Set<MealPeriodAssignment>>();
  for (const hour of menuHours) {
    const periods = mealPeriodsForOperatingWindow(hour.startTime, hour.endTime);
    for (const categoryUuid of hour.categorySnapshotUuids ?? []) {
      const assigned = periodsByCategory.get(categoryUuid) ?? new Set();
      periods.forEach((period) => assigned.add(period));
      periodsByCategory.set(categoryUuid, assigned);
    }
  }

  const byIchefUuid = new Map<
    string,
    Omit<ProviderMenuObservation["items"][number], "sortOrder">
  >();
  for (const category of categories) {
    if (!category.uuid || !category.name) continue;
    const categoryPeriods = [...(periodsByCategory.get(category.uuid) ?? [])];
    if (categoryPeriods.length === 0) continue;
    for (const item of category.menuItemsSnapshot ?? []) {
      const ichefUuid = item.ichefUuid?.trim();
      const name = item.name?.trim().replace(/\s+/g, " ");
      assertProviderMenuIdentityItems("ichef", [
        { externalProductId: ichefUuid ?? "" },
      ]);
      if (!ichefUuid || !name) continue;
      assertIchefProductUuid(ichefUuid);
      const occurrence = {
        externalProductId: ichefUuid,
        name,
        priceOptions: [
          {
            label: null,
            amountMinor: parseAmountMinor(item.price),
            currency: "HKD",
            sortOrder: 0,
          },
        ],
        mealPeriods: categoryPeriods,
        svgKey: resolveMenuSectionKey({
          categoryName: category.name,
          dishName: name,
        }),
      } satisfies Omit<ProviderMenuObservation["items"][number], "sortOrder">;
      const existing = byIchefUuid.get(ichefUuid);
      if (existing) {
        if (
          existing.name !== occurrence.name ||
          !samePriceOptions(existing.priceOptions, occurrence.priceOptions)
        ) {
          assertProviderMenuIdentityItems("ichef", [existing, occurrence]);
        }
        if (compareProviderText(occurrence.svgKey, existing.svgKey) < 0) {
          existing.svgKey = occurrence.svgKey;
        }
        const mergedMealPeriods = normalizeMealPeriods([
          ...existing.mealPeriods,
          ...occurrence.mealPeriods,
        ]);
        if (!mergedMealPeriods) throw new Error("INVALID_MEAL_PERIOD");
        existing.mealPeriods = mergedMealPeriods;
        continue;
      }
      byIchefUuid.set(ichefUuid, occurrence);
    }
  }

  const items = assignMealPeriodSortOrder(
    [...byIchefUuid.values()].map((item) => ({
      ...item,
      sortOrder: 0,
    })),
    (item) => item.mealPeriods,
  );
  if (items.length === 0) throw new Error("EMPTY_ICHEF_MENU");
  assertProviderMenuIdentityItems("ichef", items);
  return {
    snapshotCompleteness: expectedMenuSnapshotCompleteness("ichef"),
    items,
  };
}
