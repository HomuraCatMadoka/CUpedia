import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItems,
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
  const canteenId = randomUUID();
  const itemId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    mockRequireCommentAuth.mockResolvedValue({
      id: userId,
      nickname: "同步测试",
    });
    await db.insert(users).values({
      id: userId,
      email: `${userId}@test.com`,
      nickname: "同步测试",
      role: "user",
    });
    await db.insert(canteens).values({ id: canteenId, name: "同步测试食堂" });
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      name: "凍奶茶",
      mealPeriod: "lunch",
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

  afterAll(async () => {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("claims a legacy item and later deactivates it without losing history", async () => {
    const firstSnapshot = {
      source: "order-place:102830",
      items: [
        {
          externalKey: "product-42:lunch",
          name: "凍奶茶",
          mealPeriod: "lunch",
          svgKey: "drink",
          pricing: { options: [{ amountMinor: 1300, currency: "HKD" }] },
        },
      ],
    };
    const preview = await previewMenuSyncFromJson(canteenId, firstSnapshot);
    expect(preview.actions[0]).toMatchObject({ action: "claim", itemId });
    await applyMenuSyncFromJson(canteenId, firstSnapshot);

    const [claimed] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(claimed).toMatchObject({
      id: itemId,
      externalSource: "order-place:102830",
      externalKey: "product-42:lunch",
      isAvailable: true,
    });

    await applyMenuSyncFromJson(canteenId, {
      source: "order-place:102830",
      items: [
        {
          externalKey: "product-99:lunch",
          name: "新菜",
          mealPeriod: "lunch",
        },
      ],
    });

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
    expect(publicMenu.some((item) => item.name === "新菜")).toBe(true);
    await expect(createDishComment(itemId, "停供后新评论")).rejects.toThrow(
      "MENU_ITEM_NOT_FOUND",
    );
  });

  it("enforces one external identity per canteen", async () => {
    await expect(
      db.insert(canteenMenuItems).values({
        canteenId,
        name: "重复来源商品",
        externalSource: "order-place:102830",
        externalKey: "product-99:lunch",
      }),
    ).rejects.toThrow();

    const duplicates = await db
      .select({ value: count() })
      .from(canteenMenuItems)
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          eq(canteenMenuItems.externalKey, "product-99:lunch"),
        ),
      );
    expect(duplicates[0].value).toBe(1);
  });
});
