"use server";

import { db } from "@/db";
import { canteenMenuItemPrices, canteenMenuItems, canteens } from "@/db/schema";
import { count, eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import {
  countCommentsForCanteen,
  countCommentsForMenuItem,
} from "@/lib/canteen-comment-queries";
import {
  countVotesForCanteen,
  countVotesForMenuItem,
} from "@/lib/canteen-vote-queries";
import {
  isCanteenMockMode,
  mockCreateCanteen,
  mockCreateMenuItem,
  mockDeleteCanteen,
  mockDeleteMenuItem,
  mockDeleteImpactForCanteen,
  mockDeleteImpactForMenuItem,
  mockUpdateCanteen,
  mockUpdateMenuItem,
} from "@/lib/canteen-mock";
import type {
  Canteen,
  CanteenMenuItem,
  DeleteImpact,
  MealPeriod,
  MenuItemPriceOptionInput,
} from "@/lib/canteen-types";
import {
  parseMealPeriod,
  parseMenuItemsJson,
  validateCanteenName,
  validateLocation,
  validateMenuItemName,
  validatePricingInput,
  validateSortOrder,
  validateSvgKey,
} from "@/lib/canteen-types";
import { buildMenuItemPricing } from "@/lib/canteen-pricing";

function mapMenuItem(
  row: typeof canteenMenuItems.$inferSelect,
  options: Array<typeof canteenMenuItemPrices.$inferSelect>,
): CanteenMenuItem {
  return {
    id: row.id,
    canteenId: row.canteenId,
    name: row.name,
    pricing: buildMenuItemPricing(row.id, options, row.price),
    mealPeriod: row.mealPeriod as MealPeriod,
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

async function countMenuItems(canteenId: string): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(canteenMenuItems)
    .where(eq(canteenMenuItems.canteenId, canteenId));
  return result[0]?.value ?? 0;
}

export async function getCanteenDeleteImpact(
  canteenId: string,
): Promise<DeleteImpact> {
  if (isCanteenMockMode()) {
    await requireAdmin();
    return mockDeleteImpactForCanteen(canteenId);
  }
  await requireAdmin();
  const [menuItemCount, voteCount, commentCount] = await Promise.all([
    countMenuItems(canteenId),
    countVotesForCanteen(canteenId),
    countCommentsForCanteen(canteenId),
  ]);
  return { menuItemCount, voteCount, commentCount };
}

export async function getMenuItemDeleteImpact(
  menuItemId: string,
): Promise<DeleteImpact> {
  if (isCanteenMockMode()) {
    await requireAdmin();
    return mockDeleteImpactForMenuItem(menuItemId);
  }
  await requireAdmin();
  const [voteCount, commentCount] = await Promise.all([
    countVotesForMenuItem(menuItemId),
    countCommentsForMenuItem(menuItemId),
  ]);
  return { menuItemCount: 1, voteCount, commentCount };
}

export async function createCanteen(input: {
  name: unknown;
  location?: unknown;
}): Promise<Canteen> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    const row = mockCreateCanteen(input);
    revalidatePath("/admin/canteens");
    revalidatePath("/api/canteens");
    revalidatePath("/canteen");
    return row;
  }
  const name = validateCanteenName(input.name);
  const location = validateLocation(input.location ?? null);
  const now = new Date();

  const [row] = await db
    .insert(canteens)
    .values({ name, location, createdAt: now, updatedAt: now })
    .returning({
      id: canteens.id,
      name: canteens.name,
      location: canteens.location,
      createdAt: canteens.createdAt,
      updatedAt: canteens.updatedAt,
    });

  revalidatePath("/admin/canteens");
  revalidatePath("/api/canteens");
  return row;
}

export async function updateCanteen(
  id: string,
  input: { name?: unknown; location?: unknown },
): Promise<Canteen> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    const row = mockUpdateCanteen(id, input);
    revalidatePath("/admin/canteens");
    revalidatePath(`/admin/canteens/${id}`);
    revalidatePath("/api/canteens");
    revalidatePath("/canteen");
    return row;
  }
  const updates: { name?: string; location?: string | null; updatedAt: Date } =
    {
      updatedAt: new Date(),
    };
  if (input.name !== undefined) updates.name = validateCanteenName(input.name);
  if (input.location !== undefined) {
    updates.location = validateLocation(input.location);
  }

  const [row] = await db
    .update(canteens)
    .set(updates)
    .where(eq(canteens.id, id))
    .returning({
      id: canteens.id,
      name: canteens.name,
      location: canteens.location,
      createdAt: canteens.createdAt,
      updatedAt: canteens.updatedAt,
    });

  if (!row) throw new Error("CANTEEN_NOT_FOUND");

  revalidatePath("/admin/canteens");
  revalidatePath(`/admin/canteens/${id}`);
  revalidatePath("/api/canteens");
  revalidatePath(`/api/canteens/${id}/menu`);
  return row;
}

export async function deleteCanteen(id: string): Promise<void> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    mockDeleteCanteen(id);
    revalidatePath("/admin/canteens");
    revalidatePath("/api/canteens");
    revalidatePath("/canteen");
    return;
  }
  const result = await db
    .delete(canteens)
    .where(eq(canteens.id, id))
    .returning({ id: canteens.id });
  if (result.length === 0) throw new Error("CANTEEN_NOT_FOUND");

  revalidatePath("/admin/canteens");
  revalidatePath("/api/canteens");
}

export async function createMenuItem(
  canteenId: string,
  input: {
    name: unknown;
    pricing?: unknown;
    /** @deprecated Use pricing.options. */
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): Promise<CanteenMenuItem> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    const row = mockCreateMenuItem(canteenId, input);
    revalidatePath(`/admin/canteens/${canteenId}`);
    revalidatePath(`/api/canteens/${canteenId}/menu`);
    revalidatePath(`/canteen/${canteenId}`);
    return row;
  }
  const canteen = await db.query.canteens.findFirst({
    where: eq(canteens.id, canteenId),
    columns: { id: true },
  });
  if (!canteen) throw new Error("CANTEEN_NOT_FOUND");

  const mealPeriod = parseMealPeriod(String(input.mealPeriod ?? "lunch"));
  if (!mealPeriod) throw new Error("INVALID_MEAL_PERIOD");
  const options = validatePricingInput(input.pricing, input.price) ?? [];

  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [menuItem] = await tx
      .insert(canteenMenuItems)
      .values({
        canteenId,
        name: validateMenuItemName(input.name),
        price: null,
        mealPeriod,
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
            .insert(canteenMenuItemPrices)
            .values(priceOptionValues(menuItem.id, options, now))
            .returning();
    return mapMenuItem(menuItem, prices);
  });

  revalidatePath(`/admin/canteens/${canteenId}`);
  revalidatePath(`/api/canteens/${canteenId}/menu`);
  return row;
}

export async function bulkImportMenuItemsFromJson(
  canteenId: string,
  jsonInput: unknown,
): Promise<CanteenMenuItem[]> {
  await requireAdmin();
  const rows = parseMenuItemsJson(jsonInput);

  if (isCanteenMockMode()) {
    const created = rows.map((row) => mockCreateMenuItem(canteenId, row));
    revalidatePath(`/admin/canteens/${canteenId}`);
    revalidatePath(`/api/canteens/${canteenId}/menu`);
    revalidatePath(`/canteen/${canteenId}`);
    return created;
  }

  const canteen = await db.query.canteens.findFirst({
    where: eq(canteens.id, canteenId),
    columns: { id: true },
  });
  if (!canteen) throw new Error("CANTEEN_NOT_FOUND");

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const menuItems: CanteenMenuItem[] = [];
    for (const row of rows) {
      const [menuItem] = await tx
        .insert(canteenMenuItems)
        .values({
          canteenId,
          name: row.name,
          price: null,
          mealPeriod: row.mealPeriod,
          sortOrder: row.sortOrder,
          svgKey: row.svgKey,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const prices =
        row.priceOptions.length === 0
          ? []
          : await tx
              .insert(canteenMenuItemPrices)
              .values(priceOptionValues(menuItem.id, row.priceOptions, now))
              .returning();
      menuItems.push(mapMenuItem(menuItem, prices));
    }
    return menuItems;
  });

  revalidatePath(`/admin/canteens/${canteenId}`);
  revalidatePath(`/api/canteens/${canteenId}/menu`);
  revalidatePath(`/canteen/${canteenId}`);
  return created;
}

export async function updateMenuItem(
  canteenId: string,
  itemId: string,
  input: {
    name?: unknown;
    pricing?: unknown;
    /** @deprecated Use pricing.options. */
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): Promise<CanteenMenuItem> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    const row = mockUpdateMenuItem(canteenId, itemId, input);
    revalidatePath(`/admin/canteens/${canteenId}`);
    revalidatePath(`/api/canteens/${canteenId}/menu`);
    revalidatePath(`/canteen/${canteenId}`);
    return row;
  }

  const updates: {
    name?: string;
    price?: number | null;
    mealPeriod?: MealPeriod;
    sortOrder?: number;
    svgKey?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.name !== undefined) updates.name = validateMenuItemName(input.name);
  const options = validatePricingInput(input.pricing, input.price);
  if (options !== undefined) updates.price = null;
  if (input.mealPeriod !== undefined) {
    const mealPeriod = parseMealPeriod(String(input.mealPeriod));
    if (!mealPeriod) throw new Error("INVALID_MEAL_PERIOD");
    updates.mealPeriod = mealPeriod;
  }
  if (input.sortOrder !== undefined) {
    updates.sortOrder = validateSortOrder(input.sortOrder);
  }
  if (input.svgKey !== undefined) updates.svgKey = validateSvgKey(input.svgKey);

  const row = await db.transaction(async (tx) => {
    const [menuItem] = await tx
      .update(canteenMenuItems)
      .set(updates)
      .where(
        and(
          eq(canteenMenuItems.id, itemId),
          eq(canteenMenuItems.canteenId, canteenId),
        ),
      )
      .returning();

    if (!menuItem) throw new Error("MENU_ITEM_NOT_FOUND");

    if (options !== undefined) {
      await tx
        .delete(canteenMenuItemPrices)
        .where(eq(canteenMenuItemPrices.menuItemId, itemId));
      const prices =
        options.length === 0
          ? []
          : await tx
              .insert(canteenMenuItemPrices)
              .values(priceOptionValues(itemId, options, updates.updatedAt))
              .returning();
      return mapMenuItem(menuItem, prices);
    }

    const prices = await tx
      .select()
      .from(canteenMenuItemPrices)
      .where(eq(canteenMenuItemPrices.menuItemId, itemId));
    return mapMenuItem(menuItem, prices);
  });

  revalidatePath(`/admin/canteens/${canteenId}`);
  revalidatePath(`/api/canteens/${canteenId}/menu`);
  return row;
}

export async function deleteMenuItem(
  canteenId: string,
  itemId: string,
): Promise<void> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    mockDeleteMenuItem(canteenId, itemId);
    revalidatePath(`/admin/canteens/${canteenId}`);
    revalidatePath(`/api/canteens/${canteenId}/menu`);
    revalidatePath(`/canteen/${canteenId}`);
    return;
  }
  const result = await db
    .delete(canteenMenuItems)
    .where(
      and(
        eq(canteenMenuItems.id, itemId),
        eq(canteenMenuItems.canteenId, canteenId),
      ),
    )
    .returning({ id: canteenMenuItems.id });

  if (result.length === 0) {
    throw new Error("MENU_ITEM_NOT_FOUND");
  }

  revalidatePath(`/admin/canteens/${canteenId}`);
  revalidatePath(`/api/canteens/${canteenId}/menu`);
}
