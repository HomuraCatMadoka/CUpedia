"use server";

import { createHash } from "node:crypto";
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
  MenuSyncInput,
} from "@/lib/canteen-types";
import {
  parseMealPeriod,
  parseMenuItemsJson,
  parseMenuSyncJson,
  validateCanteenName,
  validateLocation,
  validateMenuItemName,
  validatePricingInput,
  validateSortOrder,
  validateSvgKey,
} from "@/lib/canteen-types";
import { buildMenuItemPricing } from "@/lib/canteen-pricing";
import {
  planMenuSync,
  type ExistingSyncMenuItem,
  type MenuSyncPlan,
} from "@/lib/canteen-menu-sync";

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

type SyncMenuRow = {
  id: string;
  name: string;
  mealPeriod: string;
  sortOrder: number;
  svgKey: string;
  legacyPrice: number | null;
  externalSource: string | null;
  externalKey: string | null;
  isAvailable: boolean;
  priceId: string | null;
  priceLabel: string | null;
  amountMinor: number | null;
  currency: string | null;
  priceSortOrder: number | null;
};

function collectExistingSyncItems(rows: SyncMenuRow[]): ExistingSyncMenuItem[] {
  const items = new Map<string, ExistingSyncMenuItem>();
  for (const row of rows) {
    const existing = items.get(row.id);
    if (existing) {
      if (row.priceId) {
        existing.priceOptions.push({
          label: row.priceLabel,
          amountMinor: row.amountMinor!,
          currency: row.currency!,
          sortOrder: row.priceSortOrder!,
        });
      }
      continue;
    }
    items.set(row.id, {
      id: row.id,
      name: row.name,
      mealPeriod: row.mealPeriod as MealPeriod,
      sortOrder: row.sortOrder,
      svgKey: row.svgKey,
      priceOptions: row.priceId
        ? [
            {
              label: row.priceLabel,
              amountMinor: row.amountMinor!,
              currency: row.currency!,
              sortOrder: row.priceSortOrder!,
            },
          ]
        : row.legacyPrice == null
          ? []
          : [
              {
                label: null,
                amountMinor: row.legacyPrice * 100,
                currency: "HKD",
                sortOrder: 0,
              },
            ],
      externalSource: row.externalSource,
      externalKey: row.externalKey,
      isAvailable: row.isAvailable,
    });
  }
  for (const item of items.values()) {
    item.priceOptions.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return [...items.values()];
}

function syncMenuSelection() {
  return {
    id: canteenMenuItems.id,
    name: canteenMenuItems.name,
    mealPeriod: canteenMenuItems.mealPeriod,
    sortOrder: canteenMenuItems.sortOrder,
    svgKey: canteenMenuItems.svgKey,
    legacyPrice: canteenMenuItems.price,
    externalSource: canteenMenuItems.externalSource,
    externalKey: canteenMenuItems.externalKey,
    isAvailable: canteenMenuItems.isAvailable,
    priceId: canteenMenuItemPrices.id,
    priceLabel: canteenMenuItemPrices.label,
    amountMinor: canteenMenuItemPrices.amountMinor,
    currency: canteenMenuItemPrices.currency,
    priceSortOrder: canteenMenuItemPrices.sortOrder,
  };
}

type MenuSyncPreview = {
  plan: MenuSyncPlan;
  previewToken: string;
};

function createMenuSyncPreviewToken(
  input: MenuSyncInput,
  existing: ExistingSyncMenuItem[],
): string {
  const normalizedExisting = [...existing]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      ...item,
      priceOptions: [...item.priceOptions].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          (a.label ?? "").localeCompare(b.label ?? "") ||
          a.currency.localeCompare(b.currency) ||
          a.amountMinor - b.amountMinor,
      ),
    }));
  return createHash("sha256")
    .update(JSON.stringify({ input, existing: normalizedExisting }))
    .digest("hex");
}

export async function previewMenuSyncFromJson(
  canteenId: string,
  jsonInput: unknown,
): Promise<MenuSyncPreview> {
  await requireAdmin();
  if (isCanteenMockMode()) throw new Error("MENU_SYNC_UNAVAILABLE");
  const input = parseMenuSyncJson(jsonInput);
  const rows = await db
    .select(syncMenuSelection())
    .from(canteenMenuItems)
    .leftJoin(
      canteenMenuItemPrices,
      eq(canteenMenuItemPrices.menuItemId, canteenMenuItems.id),
    )
    .where(eq(canteenMenuItems.canteenId, canteenId));
  const existing = collectExistingSyncItems(rows);
  return {
    plan: planMenuSync(input, existing),
    previewToken: createMenuSyncPreviewToken(input, existing),
  };
}

export async function applyMenuSyncFromJson(
  canteenId: string,
  jsonInput: unknown,
  previewToken: unknown,
): Promise<MenuSyncPlan> {
  await requireAdmin();
  if (isCanteenMockMode()) throw new Error("MENU_SYNC_UNAVAILABLE");
  const input = parseMenuSyncJson(jsonInput);
  const now = new Date();

  const plan = await db.transaction(async (tx) => {
    const canteen = await tx.query.canteens.findFirst({
      where: eq(canteens.id, canteenId),
      columns: { id: true },
    });
    if (!canteen) throw new Error("CANTEEN_NOT_FOUND");

    const rows = await tx
      .select(syncMenuSelection())
      .from(canteenMenuItems)
      .leftJoin(
        canteenMenuItemPrices,
        eq(canteenMenuItemPrices.menuItemId, canteenMenuItems.id),
      )
      .where(eq(canteenMenuItems.canteenId, canteenId))
      .for("update", { of: canteenMenuItems });
    const existing = collectExistingSyncItems(rows);
    if (previewToken !== createMenuSyncPreviewToken(input, existing)) {
      throw new Error("MENU_SYNC_STALE");
    }
    const currentPlan = planMenuSync(input, existing);
    if (currentPlan.conflicts.length > 0) throw new Error("MENU_SYNC_CONFLICT");

    const actionByKey = new Map(
      currentPlan.actions.map((action) => [action.externalKey, action]),
    );
    const existingByKey = new Map(
      existing
        .filter(
          (item) =>
            item.externalSource === input.source && item.externalKey !== null,
        )
        .map((item) => [item.externalKey!, item]),
    );

    for (const item of input.items) {
      const action = actionByKey.get(item.externalKey);
      if (action?.action === "create") {
        const [created] = await tx
          .insert(canteenMenuItems)
          .values({
            canteenId,
            name: item.name,
            price: null,
            mealPeriod: item.mealPeriod,
            sortOrder: item.sortOrder,
            svgKey: item.svgKey,
            externalSource: input.source,
            externalKey: item.externalKey,
            isAvailable: true,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: canteenMenuItems.id });
        if (item.priceOptions.length > 0) {
          await tx
            .insert(canteenMenuItemPrices)
            .values(priceOptionValues(created.id, item.priceOptions, now));
        }
        continue;
      }

      const itemId = action?.itemId ?? existingByKey.get(item.externalKey)?.id;
      if (!itemId) throw new Error("MENU_SYNC_STALE");
      await tx
        .update(canteenMenuItems)
        .set({
          name: item.name,
          price: null,
          mealPeriod: item.mealPeriod,
          sortOrder: item.sortOrder,
          svgKey: item.svgKey,
          externalSource: input.source,
          externalKey: item.externalKey,
          isAvailable: true,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(canteenMenuItems.id, itemId),
            eq(canteenMenuItems.canteenId, canteenId),
          ),
        );
      if (action) {
        await tx
          .delete(canteenMenuItemPrices)
          .where(eq(canteenMenuItemPrices.menuItemId, itemId));
        if (item.priceOptions.length > 0) {
          await tx
            .insert(canteenMenuItemPrices)
            .values(priceOptionValues(itemId, item.priceOptions, now));
        }
      }
    }

    for (const action of currentPlan.actions) {
      if (action.action !== "deactivate" || !action.itemId) continue;
      await tx
        .update(canteenMenuItems)
        .set({ isAvailable: false, lastSyncedAt: now, updatedAt: now })
        .where(
          and(
            eq(canteenMenuItems.id, action.itemId),
            eq(canteenMenuItems.canteenId, canteenId),
          ),
        );
    }
    return currentPlan;
  });

  revalidatePath(`/admin/canteens/${canteenId}`);
  revalidatePath(`/api/canteens/${canteenId}/menu`);
  revalidatePath(`/canteen/${canteenId}`);
  return plan;
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
