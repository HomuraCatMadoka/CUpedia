"use server";

import { db } from "@/db";
import {
  takeoutMenuItemPrices,
  takeoutMenuItems,
  takeouts,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type { Canteen, CanteenMenuItem } from "@/lib/canteen-types";
import { primaryMealPeriodSortKey } from "@/lib/canteen-types";
import { buildMenuItemPricing } from "@/lib/canteen-pricing";

/** Takeout venue DTO — same public shape as canteen for shared UI. */
export type Takeout = Canteen;

/** Menu item DTO; `canteenId` holds takeout id for shared menu components. */
export type TakeoutMenuItem = CanteenMenuItem;

export async function getTakeouts(): Promise<Takeout[]> {
  return db
    .select({
      id: takeouts.id,
      name: takeouts.name,
      location: takeouts.location,
      announcement: takeouts.announcement,
      createdAt: takeouts.createdAt,
      updatedAt: takeouts.updatedAt,
    })
    .from(takeouts)
    .orderBy(asc(takeouts.name));
}

export async function getTakeoutById(id: string): Promise<Takeout | null> {
  const rows = await db
    .select({
      id: takeouts.id,
      name: takeouts.name,
      location: takeouts.location,
      announcement: takeouts.announcement,
      createdAt: takeouts.createdAt,
      updatedAt: takeouts.updatedAt,
    })
    .from(takeouts)
    .where(eq(takeouts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTakeoutMenuItems(
  takeoutId: string,
): Promise<TakeoutMenuItem[]> {
  const rows = await db
    .select({
      id: takeoutMenuItems.id,
      takeoutId: takeoutMenuItems.takeoutId,
      name: takeoutMenuItems.name,
      legacyPrice: takeoutMenuItems.price,
      mealPeriods: takeoutMenuItems.mealPeriods,
      sortOrder: takeoutMenuItems.sortOrder,
      svgKey: takeoutMenuItems.svgKey,
      createdAt: takeoutMenuItems.createdAt,
      updatedAt: takeoutMenuItems.updatedAt,
      priceId: takeoutMenuItemPrices.id,
      priceLabel: takeoutMenuItemPrices.label,
      amountMinor: takeoutMenuItemPrices.amountMinor,
      currency: takeoutMenuItemPrices.currency,
      priceSortOrder: takeoutMenuItemPrices.sortOrder,
    })
    .from(takeoutMenuItems)
    .leftJoin(
      takeoutMenuItemPrices,
      eq(takeoutMenuItemPrices.menuItemId, takeoutMenuItems.id),
    )
    .where(
      and(
        eq(takeoutMenuItems.takeoutId, takeoutId),
        eq(takeoutMenuItems.isAvailable, true),
      ),
    );

  const items = new Map<string, TakeoutMenuItem>();
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
      canteenId: row.takeoutId,
      name: row.name,
      pricing: buildMenuItemPricing(
        row.id,
        option ? [option] : [],
        row.legacyPrice,
      ),
      mealPeriods: row.mealPeriods as TakeoutMenuItem["mealPeriods"],
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
