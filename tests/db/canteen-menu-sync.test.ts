import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
  canteens,
  users,
} from "@/db/schema";

const { mockRequireCommentAuth } = vi.hoisted(() => ({
  mockRequireCommentAuth: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin" }),
  requireCommentAuth: (...args: unknown[]) => mockRequireCommentAuth(...args),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

import {
  applyMenuSyncFromJson,
  previewMenuSyncFromJson,
} from "@/lib/canteen-admin-actions";
import { getCanteenMenuItems } from "@/lib/canteen-actions";
import { createDishComment } from "@/lib/canteen-comment-actions";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("canteen menu sync database", () => {
  let canteenId: string;
  let itemId: string;
  let sourceId: string;
  let userId: string;

  beforeEach(async () => {
    canteenId = randomUUID();
    itemId = randomUUID();
    sourceId = randomUUID();
    userId = randomUUID();
    mockRequireCommentAuth.mockResolvedValue({
      id: userId,
      nickname: "同步测试",
      hasPassword: true,
    });
    await db.insert(users).values({
      id: userId,
      email: `${userId}@test.com`,
      nickname: "同步测试",
      role: "user",
    });
    await db.insert(accounts).values({
      accountId: userId,
      providerId: "credential",
      userId,
      password: "test-password-hash",
    });
    await db.insert(canteens).values({ id: canteenId, name: "演示食堂" });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "aigens",
      externalStoreId: "102830",
    });
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      name: "演示菜品 A",
      mealPeriods: ["lunch"],
      svgKey: "drink",
    });
    await db.insert(canteenDishVotes).values({
      menuItemId: itemId,
      userId,
      vote: "like",
    });
    await db.insert(canteenDishComments).values({
      menuItemId: itemId,
      userId,
      content: "保留这条历史",
    });
  });

  afterEach(async () => {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("claims a legacy item and later deactivates it without losing history", async () => {
    const firstSnapshot = {
      takeOverLegacyItems: true,
      items: [
        {
          externalProductId: "product-42#offering-period=lunch",
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          svgKey: "drink",
          pricing: { options: [{ amountMinor: 1300, currency: "HKD" }] },
        },
      ],
    };
    const preview = await previewMenuSyncFromJson(canteenId, firstSnapshot);
    expect(preview.plan.actions[0]).toMatchObject({ action: "claim", itemId });
    await applyMenuSyncFromJson(canteenId, firstSnapshot, preview.previewToken);

    const [claimed] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(claimed).toMatchObject({
      id: itemId,
      menuSourceId: sourceId,
      externalProductId: "product-42#offering-period=lunch",
      externalSource: "aigens:102830",
      externalKey: "product-42#offering-period=lunch#period=lunch",
      isAvailable: true,
    });
    const [activatedSource] = await db
      .select({ enabled: canteenMenuSources.enabled })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    expect(activatedSource.enabled).toBe(true);

    const periodChangedSnapshot = {
      items: [
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "演示菜品 A",
          mealPeriods: ["dinner"],
          svgKey: "drink",
          pricing: { options: [{ amountMinor: 1300, currency: "HKD" }] },
        },
      ],
    };
    const periodChangedPreview = await previewMenuSyncFromJson(
      canteenId,
      periodChangedSnapshot,
    );
    expect(periodChangedPreview.plan.actions[0]).toMatchObject({
      action: "update",
      itemId,
      externalProductId: "product-42#offering-period=dinner",
    });
    await applyMenuSyncFromJson(
      canteenId,
      periodChangedSnapshot,
      periodChangedPreview.previewToken,
    );
    const [periodChanged] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(periodChanged).toMatchObject({
      id: itemId,
      externalProductId: "product-42#offering-period=dinner",
      externalKey: "product-42#offering-period=dinner#period=dinner",
      mealPeriods: ["dinner"],
    });
    const preservedHistory = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, itemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, itemId)),
    ]);
    expect(preservedHistory.map(([row]) => row.value)).toEqual([1, 1]);

    const secondSnapshot = {
      items: [
        {
          externalProductId: "product-99#offering-period=lunch",
          name: "演示菜品 B",
          mealPeriods: ["lunch"],
        },
      ],
    };
    const secondPreview = await previewMenuSyncFromJson(
      canteenId,
      secondSnapshot,
    );
    await applyMenuSyncFromJson(
      canteenId,
      secondSnapshot,
      secondPreview.previewToken,
    );

    const [deactivated] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(deactivated.isAvailable).toBe(false);
    const historyCounts = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, itemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, itemId)),
    ]);
    expect(historyCounts.map(([row]) => row.value)).toEqual([1, 1]);

    const publicMenu = await getCanteenMenuItems(canteenId);
    expect(publicMenu.some((item) => item.id === itemId)).toBe(false);
    expect(publicMenu.some((item) => item.name === "演示菜品 B")).toBe(true);
    await expect(createDishComment(itemId, "停供后新评论")).rejects.toThrow(
      "MENU_ITEM_NOT_FOUND",
    );
  });

  it.each([
    {
      provider: "pinme",
      externalOwnerId: null,
      externalStoreId: "5198",
      historicalId: "425657#period=lunch+dinner",
      currentId: "425657",
      mealPeriods: ["dinner"],
    },
    {
      provider: "ichef",
      externalOwnerId: null,
      externalStoreId: "UQftKWxU",
      historicalId: "item-1#period=breakfast+lunch",
      currentId: "item-1",
      mealPeriods: ["dinner"],
    },
    {
      provider: "qmai",
      externalOwnerId: "221033",
      externalStoreId: "331725",
      historicalId: "goods-1#period=lunch",
      currentId: "goods-1",
      mealPeriods: ["dinner"],
    },
    {
      provider: "aigens",
      externalOwnerId: null,
      externalStoreId: "102830",
      historicalId: "42:lunch",
      currentId: "42#offering-period=lunch",
      mealPeriods: ["lunch"],
    },
  ] as const)(
    "$provider reactivates a historical identity on its existing UUID",
    async ({
      provider,
      externalOwnerId,
      externalStoreId,
      historicalId,
      currentId,
      mealPeriods,
    }) => {
      await db
        .update(canteenMenuSources)
        .set({
          provider,
          externalOwnerId:
            externalOwnerId === null ? null : `${externalOwnerId}-${sourceId}`,
          externalStoreId: `${externalStoreId}-${sourceId}`,
        })
        .where(eq(canteenMenuSources.id, sourceId));
      await db
        .update(canteenMenuItems)
        .set({
          menuSourceId: sourceId,
          externalProductId: historicalId,
          externalSource: `${provider}:historical-test`,
          externalKey: historicalId,
          isAvailable: false,
        })
        .where(eq(canteenMenuItems.id, itemId));

      const snapshot = {
        items: [
          {
            externalProductId: currentId,
            name: "重新供應菜品",
            mealPeriods: [...mealPeriods],
            svgKey: "新分類",
            pricing: {
              options: [{ amountMinor: 9900, currency: "HKD" }],
            },
          },
        ],
      };
      const preview = await previewMenuSyncFromJson(canteenId, snapshot);
      expect(preview.plan.actions).toEqual([
        expect.objectContaining({ action: "reactivate", itemId }),
      ]);
      await applyMenuSyncFromJson(canteenId, snapshot, preview.previewToken);

      const [reactivated] = await db
        .select()
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.id, itemId));
      expect(reactivated).toMatchObject({
        id: itemId,
        externalProductId: currentId,
        name: "重新供應菜品",
        mealPeriods: [...mealPeriods],
        svgKey: "新分類",
        isAvailable: true,
      });
      const prices = await db
        .select({ amountMinor: canteenMenuItemPrices.amountMinor })
        .from(canteenMenuItemPrices)
        .where(eq(canteenMenuItemPrices.menuItemId, itemId));
      expect(prices).toEqual([{ amountMinor: 9900 }]);
      const history = await Promise.all([
        db
          .select({ value: count() })
          .from(canteenDishVotes)
          .where(eq(canteenDishVotes.menuItemId, itemId)),
        db
          .select({ value: count() })
          .from(canteenDishComments)
          .where(eq(canteenDishComments.menuItemId, itemId)),
      ]);
      expect(history.map(([row]) => row.value)).toEqual([1, 1]);
    },
  );

  it("rejects missing and stale preview tokens before writing", async () => {
    const snapshot = {
      items: [
        {
          externalProductId: "item-c#offering-period=lunch",
          name: "演示菜品 C",
          mealPeriods: ["lunch"],
        },
      ],
    };
    const preview = await previewMenuSyncFromJson(canteenId, snapshot);

    await expect(
      applyMenuSyncFromJson(canteenId, snapshot, null),
    ).rejects.toThrow("MENU_SYNC_STALE");

    const interveningItemId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: interveningItemId,
      canteenId,
      name: "演示菜品 D",
    });
    await expect(
      applyMenuSyncFromJson(canteenId, snapshot, preview.previewToken),
    ).rejects.toThrow("MENU_SYNC_STALE");

    const written = await db
      .select({ value: count() })
      .from(canteenMenuItems)
      .where(
        eq(canteenMenuItems.externalProductId, "item-c#offering-period=lunch"),
      );
    expect(written[0].value).toBe(0);
    await db
      .delete(canteenMenuItems)
      .where(eq(canteenMenuItems.id, interveningItemId));
  });

  it("enforces one external identity per canteen", async () => {
    await db.insert(canteenMenuItems).values({
      canteenId,
      name: "现有来源商品",
      menuSourceId: sourceId,
      externalProductId: "duplicate#offering-period=lunch",
      externalSource: "aigens:102830",
      externalKey: "duplicate#period=lunch",
    });
    await expect(
      db.insert(canteenMenuItems).values({
        canteenId,
        name: "重复来源商品",
        menuSourceId: sourceId,
        externalProductId: "duplicate#offering-period=lunch",
        externalSource: "aigens:102830",
        externalKey: "duplicate#period=lunch",
      }),
    ).rejects.toThrow();

    const duplicates = await db
      .select({ value: count() })
      .from(canteenMenuItems)
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          eq(
            canteenMenuItems.externalProductId,
            "duplicate#offering-period=lunch",
          ),
        ),
      );
    expect(duplicates[0].value).toBe(1);
  });

  it("rejects a source from another canteen at the database boundary", async () => {
    const otherCanteenId = randomUUID();
    const otherSourceId = randomUUID();
    await db.insert(canteens).values({
      id: otherCanteenId,
      name: "另一食堂",
    });
    await db.insert(canteenMenuSources).values({
      id: otherSourceId,
      canteenId: otherCanteenId,
      provider: "pinme",
      externalStoreId: "5203-test",
    });

    await expect(
      db.insert(canteenMenuItems).values({
        canteenId,
        name: "绝不能跨食堂写入",
        menuSourceId: otherSourceId,
        externalProductId: "cross-canteen-product",
        externalSource: "pinme:5203-test",
        externalKey: "cross-canteen-product#period=allday",
      }),
    ).rejects.toThrow();

    await db.delete(canteens).where(eq(canteens.id, otherCanteenId));
  });

  it("allows the existing canteen delete cascade with managed rows", async () => {
    const deleteCanteenId = randomUUID();
    const deleteSourceId = randomUUID();
    await db.insert(canteens).values({
      id: deleteCanteenId,
      name: "待删除同步食堂",
    });
    await db.insert(canteenMenuSources).values({
      id: deleteSourceId,
      canteenId: deleteCanteenId,
      provider: "pinme",
      externalStoreId: "delete-test",
    });
    await db.insert(canteenMenuItems).values({
      canteenId: deleteCanteenId,
      name: "待删除商品",
      menuSourceId: deleteSourceId,
      externalProductId: "delete-product",
      externalSource: "pinme:delete-test",
      externalKey: "delete-product#period=allday",
    });

    await expect(
      db.delete(canteens).where(eq(canteens.id, deleteCanteenId)),
    ).resolves.toBeDefined();
  });

  it("keeps menu integration tables behind RLS", async () => {
    const result = await db.execute<{
      relname: string;
      relrowsecurity: boolean;
    }>(sql`
      select relname, relrowsecurity
      from pg_class
      where oid in (
        'canteen_menu_sources'::regclass,
        'canteen_ordering_handoffs'::regclass,
        'canteen_menu_sync_runs'::regclass
      )
      order by relname
    `);

    expect(result.rows).toEqual([
      { relname: "canteen_menu_sources", relrowsecurity: true },
      { relname: "canteen_menu_sync_runs", relrowsecurity: true },
      { relname: "canteen_ordering_handoffs", relrowsecurity: true },
    ]);
  });
});
