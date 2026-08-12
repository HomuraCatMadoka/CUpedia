import { assignMealPeriodSortOrder } from "@/lib/canteen-aigens-parse";
import { resolveMenuSectionKey } from "@/lib/canteen-svg-keys";
import type {
  MealPeriod,
  MealPeriodAssignment,
  MenuSyncInput,
} from "@/lib/canteen-types";

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

const PERIOD_WINDOWS: Array<{
  period: MealPeriod;
  start: number;
  end: number;
}> = [
  { period: "breakfast", start: 0, end: 11 * 60 },
  { period: "lunch", start: 11 * 60, end: 17 * 60 },
  { period: "dinner", start: 17 * 60, end: 24 * 60 },
];

function minutes(value: string | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, mins] = value.split(":").map(Number);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function mealPeriodsForIchefHour(
  startTime: string | undefined,
  endTime: string | undefined,
): MealPeriodAssignment[] {
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start === null || end === null || end <= start) return ["allday"];
  const periods = PERIOD_WINDOWS.filter(
    (window) => start < window.end && end > window.start,
  ).map((window) => window.period);
  return periods.length > 0 ? periods : ["allday"];
}

function parseAmountMinor(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("INVALID_ICHEF_PRICE");
  }
  const amountMinor = Math.round(price * 100);
  if (amountMinor > 999_900) throw new Error("INVALID_ICHEF_PRICE");
  return amountMinor;
}

export function buildIchefMenuSyncPayload(
  externalStoreId: string,
  menuHours: IchefMenuHour[],
  categories: IchefCategory[],
): MenuSyncInput {
  const periodsByCategory = new Map<string, Set<MealPeriodAssignment>>();
  for (const hour of menuHours) {
    const periods = mealPeriodsForIchefHour(hour.startTime, hour.endTime);
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
      if (!uuid || !name) continue;
      const existing = byItemUuid.get(uuid);
      if (existing) {
        existing.mealPeriods = [
          ...new Set([...existing.mealPeriods, ...categoryPeriods]),
        ];
        continue;
      }
      byItemUuid.set(uuid, {
        externalKey: uuid,
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
    [...byItemUuid.values()].map((item) => ({ ...item, sortOrder: 0 })),
    (item) => item.mealPeriods,
  );
  if (items.length === 0) throw new Error("EMPTY_ICHEF_MENU");
  return {
    source: `ichef:${externalStoreId}`,
    takeOverLegacyItems: true,
    items,
  };
}
