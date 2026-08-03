"use server";

import { db } from "@/db";
import { takeoutMenuItemPrices, takeoutMenuItems, takeouts } from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { buildMenuItemPricing } from "@/lib/canteen-pricing";
import type {
  DeleteImpact,
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
} from "@/lib/canteen-types";
import {
  mealPeriodsFromRow,
  validateAnnouncement,
  validateCanteenName,
  validateLocation,
  validateMenuItemName,
  validatePricingInput,
  validateSortOrder,
  validateSvgKey,
} from "@/lib/canteen-types";
import type { Takeout, TakeoutMenuItem } from "@/lib/takeout-actions";

function mapMenuItem(
  row: typeof takeoutMenuItems.$inferSelect,
  options: Array<typeof takeoutMenuItemPrices.$inferSelect>,
): TakeoutMenuItem {
  return {
    id: row.id,
    canteenId: row.takeoutId,
    name: row.name,
    pricing: buildMenuItemPricing(row.id, options, row.price),
    mealPeriods: row.mealPeriods as MealPeriodAssignment[],
    sortOrder: row.sortOrder,
    svgKey: row.svgKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function priceOptionValues(
  menuItemId: string,
  options: MenuItemPriceOptionInput[],
  now: Date,
) {
  return options.map((option) => ({
    menuItemId,
    ...option,
    createdAt: now,
    updatedAt: now,
  }));
}

async function countMenuItems(takeoutId: string): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(takeoutMenuItems)
    .where(eq(takeoutMenuItems.takeoutId, takeoutId));
  return result[0]?.value ?? 0;
}

function revalidateTakeout(takeoutId?: string) {
  revalidatePath("/admin/takeouts");
  revalidatePath("/canteen");
  if (takeoutId) {
    revalidatePath(`/admin/takeouts/${takeoutId}`);
    revalidatePath(`/canteen/takeout/${takeoutId}`);
  }
}

export async function getTakeoutDeleteImpact(
  takeoutId: string,
): Promise<DeleteImpact> {
  await requireAdmin();
  const menuItemCount = await countMenuItems(takeoutId);
  return { menuItemCount, voteCount: 0, commentCount: 0 };
}

export async function getTakeoutMenuItemDeleteImpact(
  _menuItemId: string,
): Promise<DeleteImpact> {
  await requireAdmin();
  return { menuItemCount: 1, voteCount: 0, commentCount: 0 };
}

export async function createTakeout(input: {
  name: unknown;
  location?: unknown;
  announcement?: unknown;
}): Promise<Takeout> {
  await requireAdmin();
  const name = validateCanteenName(input.name);
  const location = validateLocation(input.location ?? null);
  const announcement = validateAnnouncement(input.announcement ?? null);
  const now = new Date();

  const [row] = await db
    .insert(takeouts)
    .values({ name, location, announcement, createdAt: now, updatedAt: now })
    .returning({
      id: takeouts.id,
      name: takeouts.name,
      location: takeouts.location,
      announcement: takeouts.announcement,
      createdAt: takeouts.createdAt,
      updatedAt: takeouts.updatedAt,
    });

  revalidateTakeout();
  return row;
}

export async function updateTakeout(
  id: string,
  input: { name?: unknown; location?: unknown; announcement?: unknown },
): Promise<Takeout> {
  await requireAdmin();
  const updates: {
    name?: string;
    location?: string | null;
    announcement?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) updates.name = validateCanteenName(input.name);
  if (input.location !== undefined) {
    updates.location = validateLocation(input.location);
  }
  if (input.announcement !== undefined) {
    updates.announcement = validateAnnouncement(input.announcement);
  }

  const [row] = await db
    .update(takeouts)
    .set(updates)
    .where(eq(takeouts.id, id))
    .returning({
      id: takeouts.id,
      name: takeouts.name,
      location: takeouts.location,
      announcement: takeouts.announcement,
      createdAt: takeouts.createdAt,
      updatedAt: takeouts.updatedAt,
    });

  if (!row) throw new Error("TAKEOUT_NOT_FOUND");

  revalidateTakeout(id);
  return row;
}

export async function deleteTakeout(id: string): Promise<void> {
  await requireAdmin();
  const result = await db
    .delete(takeouts)
    .where(eq(takeouts.id, id))
    .returning({ id: takeouts.id });
  if (result.length === 0) throw new Error("TAKEOUT_NOT_FOUND");

  revalidateTakeout();
}

export async function createTakeoutMenuItem(
  takeoutId: string,
  input: {
    name: unknown;
    pricing?: unknown;
    price?: unknown;
    mealPeriods?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): Promise<TakeoutMenuItem> {
  await requireAdmin();
  const takeout = await db.query.takeouts.findFirst({
    where: eq(takeouts.id, takeoutId),
    columns: { id: true },
  });
  if (!takeout) throw new Error("TAKEOUT_NOT_FOUND");

  const mealPeriods = mealPeriodsFromRow(input as Record<string, unknown>);
  if (!mealPeriods) throw new Error("INVALID_MEAL_PERIOD");
  const options = validatePricingInput(input.pricing, input.price) ?? [];

  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [menuItem] = await tx
      .insert(takeoutMenuItems)
      .values({
        takeoutId,
        name: validateMenuItemName(input.name),
        price: null,
        mealPeriods,
        sortOrder: validateSortOrder(input.sortOrder),
        svgKey: validateSvgKey(input.svgKey),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const prices =
      options.length === 0
        ? []
        : await tx
            .insert(takeoutMenuItemPrices)
            .values(priceOptionValues(menuItem.id, options, now))
            .returning();
    return mapMenuItem(menuItem, prices);
  });

  revalidateTakeout(takeoutId);
  return row;
}

export async function updateTakeoutMenuItem(
  takeoutId: string,
  itemId: string,
  input: {
    name?: unknown;
    pricing?: unknown;
    price?: unknown;
    mealPeriods?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): Promise<TakeoutMenuItem> {
  await requireAdmin();

  const updates: {
    name?: string;
    price?: number | null;
    mealPeriods?: MealPeriodAssignment[];
    sortOrder?: number;
    svgKey?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.name !== undefined) updates.name = validateMenuItemName(input.name);
  const options = validatePricingInput(input.pricing, input.price);
  if (options !== undefined) updates.price = null;
  if (input.mealPeriods !== undefined || input.mealPeriod !== undefined) {
    const mealPeriods = mealPeriodsFromRow(input as Record<string, unknown>);
    if (!mealPeriods) throw new Error("INVALID_MEAL_PERIOD");
    updates.mealPeriods = mealPeriods;
  }
  if (input.sortOrder !== undefined) {
    updates.sortOrder = validateSortOrder(input.sortOrder);
  }
  if (input.svgKey !== undefined) updates.svgKey = validateSvgKey(input.svgKey);

  const row = await db.transaction(async (tx) => {
    const [menuItem] = await tx
      .update(takeoutMenuItems)
      .set(updates)
      .where(
        and(
          eq(takeoutMenuItems.id, itemId),
          eq(takeoutMenuItems.takeoutId, takeoutId),
        ),
      )
      .returning();

    if (!menuItem) throw new Error("MENU_ITEM_NOT_FOUND");

    if (options !== undefined) {
      await tx
        .delete(takeoutMenuItemPrices)
        .where(eq(takeoutMenuItemPrices.menuItemId, itemId));
      const prices =
        options.length === 0
          ? []
          : await tx
              .insert(takeoutMenuItemPrices)
              .values(priceOptionValues(itemId, options, updates.updatedAt))
              .returning();
      return mapMenuItem(menuItem, prices);
    }

    const prices = await tx
      .select()
      .from(takeoutMenuItemPrices)
      .where(eq(takeoutMenuItemPrices.menuItemId, itemId));
    return mapMenuItem(menuItem, prices);
  });

  revalidateTakeout(takeoutId);
  return row;
}

export async function deleteTakeoutMenuItem(
  takeoutId: string,
  itemId: string,
): Promise<void> {
  await requireAdmin();
  const result = await db
    .delete(takeoutMenuItems)
    .where(
      and(
        eq(takeoutMenuItems.id, itemId),
        eq(takeoutMenuItems.takeoutId, takeoutId),
      ),
    )
    .returning({ id: takeoutMenuItems.id });

  if (result.length === 0) {
    throw new Error("MENU_ITEM_NOT_FOUND");
  }

  revalidateTakeout(takeoutId);
}

export async function deleteAllTakeoutMenuItems(
  takeoutId: string,
): Promise<{ deletedCount: number }> {
  await requireAdmin();

  const existing = await db.query.takeouts.findFirst({
    where: eq(takeouts.id, takeoutId),
    columns: { id: true },
  });
  if (!existing) throw new Error("TAKEOUT_NOT_FOUND");

  const deleted = await db
    .delete(takeoutMenuItems)
    .where(eq(takeoutMenuItems.takeoutId, takeoutId))
    .returning({ id: takeoutMenuItems.id });

  revalidateTakeout(takeoutId);
  return { deletedCount: deleted.length };
}
