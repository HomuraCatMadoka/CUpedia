import { createHash } from "node:crypto";
import { db } from "@/db";
import { canteenMenuItemPrices, canteenMenuItems, canteens } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  planMenuSync,
  type ExistingSyncMenuItem,
  type MenuSyncPlan,
} from "@/lib/canteen-menu-sync";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncInput,
} from "@/lib/canteen-types";

type SyncMenuRow = {
  id: string;
  name: string;
  mealPeriods: string[];
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
      mealPeriods: row.mealPeriods as MealPeriodAssignment[],
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
    mealPeriods: canteenMenuItems.mealPeriods,
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

export type MenuSyncPreview = {
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

export async function previewMenuSync(
  canteenId: string,
  input: MenuSyncInput,
): Promise<MenuSyncPreview> {
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

async function applyMenuSync(
  canteenId: string,
  input: MenuSyncInput,
  expectedPreviewToken?: unknown,
  shouldRevalidate = true,
): Promise<MenuSyncPlan> {
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
    if (
      expectedPreviewToken !== undefined &&
      expectedPreviewToken !== createMenuSyncPreviewToken(input, existing)
    ) {
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
            mealPeriods: item.mealPeriods,
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
          mealPeriods: item.mealPeriods,
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

  if (shouldRevalidate) {
    revalidatePath(`/admin/canteens/${canteenId}`);
    revalidatePath(`/api/canteens/${canteenId}/menu`);
    revalidatePath(`/canteen/${canteenId}`);
  }
  return plan;
}

export function applyPreviewedMenuSync(
  canteenId: string,
  input: MenuSyncInput,
  previewToken: unknown,
): Promise<MenuSyncPlan> {
  return applyMenuSync(canteenId, input, previewToken);
}

export function applyAutomatedMenuSync(
  canteenId: string,
  input: MenuSyncInput,
  previewToken: unknown,
): Promise<MenuSyncPlan> {
  return applyMenuSync(canteenId, input, previewToken, false);
}
