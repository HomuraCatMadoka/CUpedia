"use server";

import { db } from "@/db";
import { canteenMenuItems, canteens } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import type { Canteen, CanteenMenuItem } from "@/lib/canteen-types";
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
  return db
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
    .where(eq(canteenMenuItems.canteenId, canteenId))
    .orderBy(
      asc(canteenMenuItems.mealPeriod),
      asc(canteenMenuItems.sortOrder),
      asc(canteenMenuItems.name),
    ) as Promise<CanteenMenuItem[]>;
}
