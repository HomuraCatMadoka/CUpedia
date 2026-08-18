import { revalidateTag, unstable_cache } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenMenuItemPrices,
  canteenMenuItems,
  canteens,
} from "@/db/schema";
import type { Canteen, CanteenMenuItem } from "@/lib/canteen-types";
import { primaryMealPeriodSortKey } from "@/lib/canteen-types";
import { buildMenuItemPricing } from "@/lib/canteen-pricing";
import { CANTEEN_COMMENT_COUNTS_TAG } from "@/lib/canteen-comment-queries";

export const CANTEEN_MENU_ITEMS_TAG = "canteen-menu-items";
export const CANTEEN_DETAIL_TAG = "canteen-detail";

async function queryCanteenMenuItems(
  canteenId: string,
): Promise<CanteenMenuItem[]> {
  const rows = await db
    .select({
      id: canteenMenuItems.id,
      canteenId: canteenMenuItems.canteenId,
      name: canteenMenuItems.name,
      legacyPrice: canteenMenuItems.price,
      mealPeriods: canteenMenuItems.mealPeriods,
      sortOrder: canteenMenuItems.sortOrder,
      svgKey: canteenMenuItems.svgKey,
      createdAt: canteenMenuItems.createdAt,
      updatedAt: canteenMenuItems.updatedAt,
      priceId: canteenMenuItemPrices.id,
      priceLabel: canteenMenuItemPrices.label,
      amountMinor: canteenMenuItemPrices.amountMinor,
      currency: canteenMenuItemPrices.currency,
      priceSortOrder: canteenMenuItemPrices.sortOrder,
    })
    .from(canteenMenuItems)
    .leftJoin(
      canteenMenuItemPrices,
      eq(canteenMenuItemPrices.menuItemId, canteenMenuItems.id),
    )
    .where(
      and(
        eq(canteenMenuItems.canteenId, canteenId),
        eq(canteenMenuItems.isAvailable, true),
      ),
    );

  const items = new Map<string, CanteenMenuItem>();
  for (const row of rows) {
    const existing = items.get(row.id);
    const option = row.priceId
      ? {
          id: row.priceId,
          label: row.priceLabel,
          amountMinor: row.amountMinor!,
          currency: row.currency!,
          sortOrder: row.priceSortOrder!,
        }
      : null;
    if (existing) {
      if (option) existing.pricing!.options.push(option);
      continue;
    }
    items.set(row.id, {
      id: row.id,
      canteenId: row.canteenId,
      name: row.name,
      pricing: buildMenuItemPricing(
        row.id,
        option ? [option] : [],
        row.legacyPrice,
      ),
      mealPeriods: row.mealPeriods as CanteenMenuItem["mealPeriods"],
      sortOrder: row.sortOrder,
      svgKey: row.svgKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  for (const item of items.values()) {
    item.pricing?.options.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.label?.localeCompare(b.label ?? "") || 0,
    );
  }

  return [...items.values()].sort((a, b) => {
    const periodCmp =
      primaryMealPeriodSortKey(a.mealPeriods) -
      primaryMealPeriodSortKey(b.mealPeriods);
    if (periodCmp !== 0) return periodCmp;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

const getCachedCanteenMenuItems = unstable_cache(
  queryCanteenMenuItems,
  ["canteen-menu-items"],
  { tags: [CANTEEN_MENU_ITEMS_TAG], revalidate: 60 },
);

async function queryCanteenById(id: string): Promise<Canteen | null> {
  const rows = await db
    .select({
      id: canteens.id,
      name: canteens.name,
      location: canteens.location,
      announcement: canteens.announcement,
      createdAt: canteens.createdAt,
      updatedAt: canteens.updatedAt,
    })
    .from(canteens)
    .where(eq(canteens.id, id))
    .limit(1);
  return rows[0] ?? null;
}

const getCachedCanteenById = unstable_cache(
  queryCanteenById,
  ["canteen-by-id"],
  { tags: [CANTEEN_DETAIL_TAG], revalidate: 60 },
);

/** Cached public menu for a canteen. Dates are revived after cache deserialize. */
export async function getCachedPublicCanteenMenuItems(
  canteenId: string,
): Promise<CanteenMenuItem[]> {
  const items = await getCachedCanteenMenuItems(canteenId);
  return items.map((item) => ({
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }));
}

/** Cached canteen shell fields. Dates are revived after cache deserialize. */
export async function getCachedPublicCanteenById(
  id: string,
): Promise<Canteen | null> {
  const row = await getCachedCanteenById(id);
  if (!row) return null;
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function revalidateCanteenMenuCache() {
  revalidateTag(CANTEEN_MENU_ITEMS_TAG, "max");
  revalidateTag(CANTEEN_DETAIL_TAG, "max");
  // Menu structure changes also shift per-item comment totals.
  revalidateTag(CANTEEN_COMMENT_COUNTS_TAG, "max");
}
