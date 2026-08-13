import { assignMealPeriodSortOrder } from "@/lib/canteen-aigens-parse";
import { mealPeriodsForOperatingWindow } from "@/lib/canteen-provider-menu-periods";
import {
  assertCompatibleProviderIdentityOccurrence,
  assertProviderMenuIdentityItems,
} from "./canteen-provider-menu-identity";
import { resolveMenuSectionKey } from "@/lib/canteen-svg-keys";
import type { MealPeriodAssignment, MenuSyncInput } from "@/lib/canteen-types";

type IchefMenuHour = {
  startTime?: string;
  endTime?: string;
  categorySnapshotUuids?: string[];
};

type IchefMenuItem = {
  uuid?: string;
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

export function buildIchefMenuSyncPayload(
  menuHours: IchefMenuHour[],
  categories: IchefCategory[],
): MenuSyncInput {
  const periodsByCategory = new Map<string, Set<MealPeriodAssignment>>();
  for (const hour of menuHours) {
    const periods = mealPeriodsForOperatingWindow(hour.startTime, hour.endTime);
    for (const categoryUuid of hour.categorySnapshotUuids ?? []) {
      const assigned = periodsByCategory.get(categoryUuid) ?? new Set();
      periods.forEach((period) => assigned.add(period));
      periodsByCategory.set(categoryUuid, assigned);
    }
  }

  const byItemUuid = new Map<
    string,
    Omit<MenuSyncInput["items"][number], "sortOrder">
  >();
  for (const category of categories) {
    if (!category.uuid || !category.name) continue;
    const categoryPeriods = [...(periodsByCategory.get(category.uuid) ?? [])];
    if (categoryPeriods.length === 0) continue;
    for (const item of category.menuItemsSnapshot ?? []) {
      const uuid = item.uuid?.trim();
      const name = item.name?.trim().replace(/\s+/g, " ");
      assertProviderMenuIdentityItems("ichef", [
        { externalProductId: uuid ?? "" },
      ]);
      if (!uuid || !name) continue;
      const existing = byItemUuid.get(uuid);
      if (existing) {
        const svgKey = resolveMenuSectionKey({
          categoryName: category.name,
          dishName: name,
        });
        assertCompatibleProviderIdentityOccurrence("ichef", existing, {
          externalProductId: uuid,
          name,
          priceOptions: [
            {
              label: null,
              amountMinor: parseAmountMinor(item.price),
              currency: "HKD",
              sortOrder: 0,
            },
          ],
          svgKey,
        });
        existing.mealPeriods = [
          ...new Set([...existing.mealPeriods, ...categoryPeriods]),
        ];
        continue;
      }
      byItemUuid.set(uuid, {
        externalProductId: uuid,
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
      });
    }
  }

  const items = assignMealPeriodSortOrder(
    [...byItemUuid.values()].map((item) => ({
      ...item,
      sortOrder: 0,
    })),
    (item) => item.mealPeriods,
  );
  if (items.length === 0) throw new Error("EMPTY_ICHEF_MENU");
  assertProviderMenuIdentityItems("ichef", items);
  return {
    takeOverLegacyItems: false,
    items,
  };
}
