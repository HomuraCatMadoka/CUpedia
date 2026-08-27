import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenMenuItems,
  canteenMenuOfferingOccurrences,
  canteenMenuProviderOfferings,
  canteenMenuSources,
  canteens,
} from "@/db/schema";
import {
  applyPreviewedMenuSync,
  previewMenuSync,
} from "@/lib/canteen-menu-sync-store";
import { parseMenuSyncJson } from "@/lib/canteen-types";
import type { MenuSyncInput } from "@/lib/canteen-types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("canonical canteen menu offering schema", () => {
  let canteenId: string;
  let sourceId: string;
  let dishId: string;

  beforeEach(async () => {
    canteenId = randomUUID();
    sourceId = randomUUID();
    dishId = randomUUID();
    await db.insert(canteens).values({ id: canteenId, name: "Canonical test" });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "ichef",
      externalStoreId: `store-${sourceId}`,
    });
    await db.insert(canteenMenuItems).values({
      id: dishId,
      canteenId,
      name: "芝士奶蓋可可",
      normalizedName: "芝士奶蓋可可",
      menuSourceId: sourceId,
      externalProductId: "legacy-primary-id",
    });
  });

  afterEach(async () => {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
  });

  it("maps many provider IDs to exactly one canonical UUID", async () => {
    await db.insert(canteenMenuProviderOfferings).values([
      {
        canteenId,
        menuSourceId: sourceId,
        menuItemId: dishId,
        externalProductId: "breakfast-id",
        providerName: "芝士奶蓋可可",
        normalizedName: "芝士奶蓋可可",
      },
      {
        canteenId,
        menuSourceId: sourceId,
        menuItemId: dishId,
        externalProductId: "dinner-id",
        providerName: "芝士奶蓋可可",
        normalizedName: "芝士奶蓋可可",
      },
    ]);

    const otherDishId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: otherDishId,
      canteenId,
      name: "另一道菜",
      normalizedName: "另一道菜",
      menuSourceId: sourceId,
      externalProductId: "other-primary-id",
    });
    await expect(
      db.insert(canteenMenuProviderOfferings).values({
        canteenId,
        menuSourceId: sourceId,
        menuItemId: otherDishId,
        externalProductId: "breakfast-id",
        providerName: "另一道菜",
        normalizedName: "另一道菜",
      }),
    ).rejects.toThrow();

    const otherCanteenId = randomUUID();
    const foreignDishId = randomUUID();
    await db
      .insert(canteens)
      .values({ id: otherCanteenId, name: "Other canteen" });
    await db.insert(canteenMenuItems).values({
      id: foreignDishId,
      canteenId: otherCanteenId,
      name: "跨食堂菜品",
    });
    await expect(
      db.insert(canteenMenuProviderOfferings).values({
        canteenId,
        menuSourceId: sourceId,
        menuItemId: foreignDishId,
        externalProductId: "cross-canteen-id",
        providerName: "跨食堂菜品",
        normalizedName: "跨食堂菜品",
      }),
    ).rejects.toThrow();
    await db.delete(canteens).where(eq(canteens.id, otherCanteenId));
  });

  it("retains meal-period price, category, and ordering facts", async () => {
    const [offering] = await db
      .insert(canteenMenuProviderOfferings)
      .values({
        canteenId,
        menuSourceId: sourceId,
        menuItemId: dishId,
        externalProductId: "period-id",
        providerName: "芝士奶蓋可可",
        normalizedName: "芝士奶蓋可可",
      })
      .returning({ id: canteenMenuProviderOfferings.id });

    await db.insert(canteenMenuOfferingOccurrences).values([
      {
        offeringId: offering.id,
        mealPeriod: "breakfast",
        categoryKey: "早餐飲品",
        sortOrder: 2,
        priceOptions: [
          { label: null, amountMinor: 2600, currency: "HKD", sortOrder: 0 },
        ],
      },
      {
        offeringId: offering.id,
        mealPeriod: "dinner",
        categoryKey: "晚市飲品",
        sortOrder: 7,
        priceOptions: [
          { label: null, amountMinor: 2800, currency: "HKD", sortOrder: 0 },
        ],
      },
    ]);

    const rows = await db
      .select()
      .from(canteenMenuOfferingOccurrences)
      .where(eq(canteenMenuOfferingOccurrences.offeringId, offering.id));
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mealPeriod: "breakfast",
          categoryKey: "早餐飲品",
          sortOrder: 2,
        }),
        expect.objectContaining({
          mealPeriod: "dinner",
          categoryKey: "晚市飲品",
          sortOrder: 7,
        }),
      ]),
    );
  });

  it("persists two same-name upstream products as one public dish", async () => {
    const input = parseMenuSyncJson({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: "same-name-breakfast",
          name: "阿拉丁之茶",
          mealPeriods: ["breakfast"],
          svgKey: "早餐",
          price: 20,
        },
        {
          externalProductId: "same-name-dinner",
          name: "阿拉丁之茶",
          mealPeriods: ["dinner"],
          svgKey: "晚餐",
          price: 22,
        },
      ],
    });
    const preview = await previewMenuSync(sourceId, input);
    await applyPreviewedMenuSync(sourceId, input, preview.previewToken);

    const dishes = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.normalizedName, "阿拉丁之茶"));
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({
      mealPeriods: ["breakfast", "dinner"],
      isAvailable: true,
    });

    const savedOfferings = await db
      .select()
      .from(canteenMenuProviderOfferings)
      .where(eq(canteenMenuProviderOfferings.menuItemId, dishes[0].id));
    expect(savedOfferings.map((item) => item.externalProductId).sort()).toEqual(
      ["same-name-breakfast", "same-name-dinner"],
    );
    const occurrences = await db
      .select()
      .from(canteenMenuOfferingOccurrences)
      .where(
        eq(canteenMenuOfferingOccurrences.offeringId, savedOfferings[0].id),
      );
    expect(occurrences).toHaveLength(1);
  });

  it("persists exact provider occurrences without inventing a cross-product", async () => {
    const breakfastPrice = [
      { label: null, amountMinor: 2000, currency: "HKD", sortOrder: 0 },
    ];
    const dinnerPrice = [
      { label: null, amountMinor: 2500, currency: "HKD", sortOrder: 0 },
    ];
    const input = {
      snapshotCompleteness: "complete",
      takeOverLegacyItems: false,
      items: [
        {
          externalProductId: "multi-context-id",
          name: "兩段價格菜",
          priceOptions: [...breakfastPrice, ...dinnerPrice],
          mealPeriods: ["breakfast", "dinner"],
          sortOrder: 99,
          svgKey: "聚合欄位不可作主分類",
          occurrences: [
            {
              mealPeriod: "breakfast",
              categoryKey: "早餐類",
              sortOrder: 4,
              priceOptions: breakfastPrice,
            },
            {
              mealPeriod: "dinner",
              categoryKey: "晚餐類",
              sortOrder: 9,
              priceOptions: dinnerPrice,
            },
          ],
        },
      ],
    } satisfies MenuSyncInput;

    const preview = await previewMenuSync(sourceId, input);
    await applyPreviewedMenuSync(sourceId, input, preview.previewToken);
    const [offering] = await db
      .select({ id: canteenMenuProviderOfferings.id })
      .from(canteenMenuProviderOfferings)
      .where(
        eq(canteenMenuProviderOfferings.externalProductId, "multi-context-id"),
      );
    const [canonical] = await db
      .select({
        sortOrder: canteenMenuItems.sortOrder,
        svgKey: canteenMenuItems.svgKey,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.normalizedName, "兩段價格菜"));
    const rows = await db
      .select()
      .from(canteenMenuOfferingOccurrences)
      .where(eq(canteenMenuOfferingOccurrences.offeringId, offering.id));

    expect(rows).toHaveLength(2);
    expect(canonical).toEqual({ sortOrder: 4, svgKey: "早餐類" });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mealPeriod: "breakfast",
          categoryKey: "早餐類",
          sortOrder: 4,
          priceOptions: breakfastPrice,
        }),
        expect.objectContaining({
          mealPeriod: "dinner",
          categoryKey: "晚餐類",
          sortOrder: 9,
          priceOptions: dinnerPrice,
        }),
      ]),
    );
  });

  it("keeps the canonical UUID through price and provider-ID changes", async () => {
    const first = parseMenuSyncJson({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: "old-upstream-id",
          name: "凍檸茶",
          price: 12,
        },
      ],
    });
    const firstPreview = await previewMenuSync(sourceId, first);
    await applyPreviewedMenuSync(sourceId, first, firstPreview.previewToken);
    const [before] = await db
      .select({ id: canteenMenuItems.id })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.normalizedName, "凍檸茶"));

    const changed = parseMenuSyncJson({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: "new-upstream-id",
          name: "凍檸茶",
          price: 14,
        },
      ],
    });
    const changedPreview = await previewMenuSync(sourceId, changed);
    expect(changedPreview.blockingDecision.blocked).toBe(false);
    await applyPreviewedMenuSync(
      sourceId,
      changed,
      changedPreview.previewToken,
    );

    const [after] = await db
      .select({ id: canteenMenuItems.id })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.normalizedName, "凍檸茶"));
    expect(after.id).toBe(before.id);
    const offeringStates = await db
      .select({
        externalProductId: canteenMenuProviderOfferings.externalProductId,
        isAvailable: canteenMenuProviderOfferings.isAvailable,
      })
      .from(canteenMenuProviderOfferings)
      .where(eq(canteenMenuProviderOfferings.menuItemId, before.id));
    expect(offeringStates).toEqual(
      expect.arrayContaining([
        { externalProductId: "old-upstream-id", isAvailable: false },
        { externalProductId: "new-upstream-id", isAvailable: true },
      ]),
    );
  });
});
