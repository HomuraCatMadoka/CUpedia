"use server";

import { db } from "@/db";
import {
  canteenMenuItems,
  canteenMenuSources,
  canteenOrderingHandoffs,
  canteens,
} from "@/db/schema";
import { and, asc, eq, count } from "drizzle-orm";
import type { Canteen, CanteenMenuItem } from "@/lib/canteen-types";
import {
  orderingHandoffFromMenuSource,
  type OrderingHandoff,
} from "@/lib/canteen-ordering-handoff";
import {
  getCachedPublicCanteenById,
  getCachedPublicCanteenMenuItems,
} from "@/lib/canteen-menu-queries";
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
  return getCachedPublicCanteenById(id);
}

export async function getCanteenOrderingHandoff(
  canteenId: string,
): Promise<OrderingHandoff | null> {
  if (isCanteenMockMode()) return null;
  const [stored, source] = await Promise.all([
    db
      .select({
        provider: canteenOrderingHandoffs.provider,
        url: canteenOrderingHandoffs.url,
      })
      .from(canteenOrderingHandoffs)
      .where(
        and(
          eq(canteenOrderingHandoffs.canteenId, canteenId),
          eq(canteenOrderingHandoffs.enabled, true),
        ),
      )
      .limit(1),
    db
      .select({
        provider: canteenMenuSources.provider,
        externalStoreId: canteenMenuSources.externalStoreId,
        config: canteenMenuSources.config,
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.canteenId, canteenId))
      .limit(1),
  ]);
  return stored[0] ?? orderingHandoffFromMenuSource(source[0]);
}

export async function getOrderingHandoffForVenueName(
  name: string,
): Promise<OrderingHandoff | null> {
  if (isCanteenMockMode()) return null;
  const rows = await db
    .select({ id: canteens.id })
    .from(canteens)
    .where(eq(canteens.name, name))
    .limit(1);
  const canteenId = rows[0]?.id;
  if (!canteenId) return null;
  return getCanteenOrderingHandoff(canteenId);
}

export async function getCanteenMenuFreshness(canteenId: string): Promise<{
  lastSuccessAt: Date | null;
  stale: boolean;
} | null> {
  if (isCanteenMockMode()) return null;
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.canteenId, canteenId),
    columns: { lastSuccessAt: true },
  });
  if (!source) return null;
  const staleBefore = Date.now() - 48 * 60 * 60 * 1_000;
  return {
    lastSuccessAt: source.lastSuccessAt,
    stale:
      source.lastSuccessAt === null ||
      source.lastSuccessAt.getTime() < staleBefore,
  };
}

export async function getCanteenMenuItems(
  canteenId: string,
): Promise<CanteenMenuItem[]> {
  if (isCanteenMockMode()) return mockListMenuItems(canteenId);
  return getCachedPublicCanteenMenuItems(canteenId);
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
