"use server";

import { db } from "@/db";
import {
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
  canteenOrderingHandoffs,
  canteens,
  MEAL_PERIODS,
} from "@/db/schema";
import { asc, eq, count, and } from "drizzle-orm";
import type {
  Canteen,
  CanteenMenuFreshness,
  CanteenMenuItem,
} from "@/lib/canteen-types";
import { primaryMealPeriodSortKey } from "@/lib/canteen-types";
import { buildMenuItemPricing } from "@/lib/canteen-pricing";
import type { OrderingHandoff } from "@/lib/canteen-ordering-handoff";
import {
  isCanteenMockMode,
  mockGetCanteen,
  mockListCanteens,
  mockListMenuItems,
} from "@/lib/canteen-mock";
import { readLatestAcceptedMenuPeriodObservations } from "@/lib/canteen-menu-sync-snapshots";

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

export async function getCanteenOrderingHandoff(
  canteenId: string,
): Promise<OrderingHandoff | null> {
  if (isCanteenMockMode()) return null;
  const rows = await db
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
    .limit(1);
  return rows[0] ?? null;
}

export async function getCanteenMenuFreshness(
  canteenId: string,
): Promise<CanteenMenuFreshness | null> {
  if (isCanteenMockMode()) return null;
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.canteenId, canteenId),
    columns: { id: true, syncMealPeriods: true },
  });
  if (!source) return null;
  return db.transaction(async (tx) => {
    const evaluatedAt = new Date();
    const observations = await readLatestAcceptedMenuPeriodObservations(
      tx,
      source.id,
      source.syncMealPeriods,
    );
    const configured = new Set(source.syncMealPeriods);
    return {
      evaluatedAt,
      periods: Object.fromEntries(
        MEAL_PERIODS.map((period) => [
          period,
          configured.has(period)
            ? (observations[period]?.observedAt ?? null)
            : null,
        ]),
      ) as CanteenMenuFreshness["periods"],
    };
  });
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
