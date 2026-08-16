import { assignMealPeriodSortOrder } from "@/lib/canteen-aigens-parse";
import { mealPeriodsForOperatingWindow } from "@/lib/canteen-provider-menu-periods";
import {
  assertCompatibleProviderIdentityOccurrence,
  assertProviderMenuIdentityItems,
} from "./canteen-provider-menu-identity";
import { expectedMenuSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";
import { resolveMenuSectionKey } from "@/lib/canteen-svg-keys";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncInput,
} from "@/lib/canteen-types";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized || null;
}

function amountMinor(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9_999) return null;
  return Math.round(amount * 100);
}

function skuLabel(sku: JsonObject): string | null {
  const parts = array(sku.skuItemList)
    .map(object)
    .filter((item): item is JsonObject => item !== null)
    .map((item) =>
      text(item.itemName ?? item.name ?? item.valueName ?? item.value),
    )
    .filter((value): value is string => value !== null);
  return parts.length > 0 ? parts.join(" / ") : text(sku.skuName ?? sku.name);
}

function priceOptions(item: JsonObject): MenuItemPriceOptionInput[] {
  const options = array(item.skuList)
    .map(object)
    .filter((sku): sku is JsonObject => sku !== null)
    .map((sku, index) => {
      const amount = amountMinor(sku.salePrice ?? sku.price);
      if (amount === null) return null;
      return {
        label: skuLabel(sku),
        amountMinor: amount,
        currency: "HKD",
        sortOrder: index,
      };
    })
    .filter((option): option is MenuItemPriceOptionInput => option !== null);
  if (options.length === 1) options[0].label = null;
  return options;
}

function operatingWindows(value: unknown): Array<[string, string]> {
  const saleTime = object(value);
  const candidates = [
    ...array(saleTime?.weekTimeList),
    ...array(saleTime?.timeList),
  ];
  const windows: Array<[string, string]> = [];
  for (const candidate of candidates) {
    const row = object(candidate);
    if (!row) continue;
    const nested = array(row.timeList).length > 0 ? array(row.timeList) : [row];
    for (const nestedValue of nested) {
      const interval = object(nestedValue);
      const start = text(
        interval?.startTime ?? interval?.start ?? interval?.beginTime,
      );
      const end = text(
        interval?.endTime ?? interval?.end ?? interval?.finishTime,
      );
      if (start && end) windows.push([start.slice(0, 5), end.slice(0, 5)]);
    }
  }
  return windows;
}

function mealPeriods(item: JsonObject): MealPeriodAssignment[] {
  const periods = new Set<MealPeriodAssignment>();
  for (const [start, end] of operatingWindows(item.saleTime)) {
    mealPeriodsForOperatingWindow(start, end).forEach((period) =>
      periods.add(period),
    );
  }
  return periods.size > 0 ? [...periods] : ["allday"];
}

function isAvailable(item: JsonObject): boolean {
  if (Number(item.available ?? 1) === 0) return false;
  if (Number(item.stockStatus ?? 1) === 0) return false;
  const inventory = Number(item.totalInventory);
  return !Number.isFinite(inventory) || inventory > 0;
}

export function buildQmaiMenuSyncPayload(input: unknown): MenuSyncInput {
  const root = object(input);
  const data = object(root?.data);
  if (
    Number(root?.code) !== 0 ||
    root?.status !== true ||
    !data ||
    !Array.isArray(data.categoryItems)
  ) {
    throw new Error("QMAI_MENU_ERROR");
  }

  const candidates = new Map<string, MenuSyncInput["items"][number]>();
  for (const categoryValue of data.categoryItems) {
    const category = object(categoryValue);
    if (!category || Number(category.available ?? 1) === 0) continue;
    const categoryName = text(category.categoryName ?? category.name) ?? "其他";
    if (!Array.isArray(category.itemList)) throw new Error("INVALID_QMAI_MENU");
    for (const itemValue of category.itemList) {
      const item = object(itemValue);
      const externalProductId = text(item?.goodsId);
      const name = text(item?.name ?? item?.goodsName);
      if (!item) continue;
      if (!isAvailable(item)) continue;
      assertProviderMenuIdentityItems("qmai", [
        { externalProductId: externalProductId ?? "" },
      ]);
      if (!externalProductId || !name) continue;
      const options = priceOptions(item);
      if (options.length === 0) continue;
      const periods = mealPeriods(item);
      const existing = candidates.get(externalProductId);
      if (existing) {
        const svgKey = resolveMenuSectionKey({ categoryName, dishName: name });
        assertCompatibleProviderIdentityOccurrence("qmai", existing, {
          externalProductId,
          name,
          priceOptions: options,
          mealPeriods: periods,
          svgKey,
        });
        existing.mealPeriods = [
          ...new Set([...existing.mealPeriods, ...periods]),
        ];
        continue;
      }
      candidates.set(externalProductId, {
        externalProductId,
        name,
        priceOptions: options,
        mealPeriods: periods,
        sortOrder: 0,
        svgKey: resolveMenuSectionKey({ categoryName, dishName: name }),
      });
    }
  }
  const items = [...candidates.values()];
  if (items.length === 0) throw new Error("EMPTY_QMAI_MENU");
  assertProviderMenuIdentityItems("qmai", items);
  return {
    snapshotCompleteness: expectedMenuSnapshotCompleteness("qmai"),
    takeOverLegacyItems: false,
    items: assignMealPeriodSortOrder(items, (item) => item.mealPeriods),
  };
}
