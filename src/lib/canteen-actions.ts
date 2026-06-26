"use server";

import { db } from "@/db";
import { canteenMenuItems, canteens } from "@/db/schema";
import { asc, eq, count } from "drizzle-orm";
import type { Canteen, CanteenMenuItem } from "@/lib/canteen-types";
import { compareMealPeriods } from "@/lib/canteen-types";
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
  const rows = (await db
    .select({
      id: canteenMenuItems.id,
      canteenId: canteenMenuItems.canteenId,
      name: canteenMenuItems.name,
      price: canteenMenuItems.price,
      mealPeriod: canteenMenuItems.mealPeriod,
      sortOrder: canteenMenuItems.sortOrder,
      svgKey: canteenMenuItems.svgKey,
      createdAt: canteenMenuItems.createdAt,
      updatedAt: canteenMenuItems.updatedAt,
    })
    .from(canteenMenuItems)
    .where(eq(canteenMenuItems.canteenId, canteenId))) as CanteenMenuItem[];

  return rows.sort((a, b) => {
    const periodCmp = compareMealPeriods(a.mealPeriod, b.mealPeriod);
    if (periodCmp !== 0) return periodCmp;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

export async function getCanteenMenuItemCounts(): Promise<Record<string, number>> {
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
    .groupBy(canteenMenuItems.canteenId);
  return Object.fromEntries(rows.map((r) => [r.canteenId, r.value]));
}
