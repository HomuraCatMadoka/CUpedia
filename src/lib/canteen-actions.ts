"use server";

import { db } from "@/db";
import { canteenMenuItemPrices, canteenMenuItems, canteens } from "@/db/schema";
import { asc, eq, count, and } from "drizzle-orm";
import type { Canteen, CanteenMenuItem } from "@/lib/canteen-types";
import { compareMealPeriods } from "@/lib/canteen-types";
import { buildMenuItemPricing } from "@/lib/canteen-pricing";
import {
  isCanteenMockMode,
  mockGetCanteen,
  mockListCanteens,
  mockListMenuItems,
} from "@/lib/canteen-mock";

export async function getCanteens(): Promise<Canteen[]> {
  if (isCanteenMockMode()) return mockListCanteens();
  return db
    .select({
      id: canteens.id,
      name: canteens.name,
      location: canteens.location,
      announcement: canteens.announcement,
      createdAt: canteens.createdAt,
      updatedAt: canteens.updatedAt,
    })
    .from(canteens)
    .orderBy(asc(canteens.name));
}

export async function getCanteenById(id: string): Promise<Canteen | null> {
  if (isCanteenMockMode()) return mockGetCanteen(id);
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

export async function getCanteenMenuItems(
  canteenId: string,
): Promise<CanteenMenuItem[]> {
  if (isCanteenMockMode()) return mockListMenuItems(canteenId);
  const rows = await db
    .select({
      id: canteenMenuItems.id,
      canteenId: canteenMenuItems.canteenId,
      name: canteenMenuItems.name,
      legacyPrice: canteenMenuItems.price,
      mealPeriod: canteenMenuItems.mealPeriod,
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
      mealPeriod: row.mealPeriod as CanteenMenuItem["mealPeriod"],
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
    const periodCmp = compareMealPeriods(a.mealPeriod, b.mealPeriod);
    if (periodCmp !== 0) return periodCmp;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

export async function getCanteenMenuItemCounts(): Promise<
  Record<string, number>
> {
  if (isCanteenMockMode()) {
    const list = mockListCanteens();
    return Object.fromEntries(
      list.map((c) => [c.id, mockListMenuItems(c.id).length]),
    );
  }
  const rows = await db
    .select({
      canteenId: canteenMenuItems.canteenId,
      value: count(),
    })
    .from(canteenMenuItems)
    .where(eq(canteenMenuItems.isAvailable, true))
    .groupBy(canteenMenuItems.canteenId);
  return Object.fromEntries(rows.map((r) => [r.canteenId, r.value]));
}
