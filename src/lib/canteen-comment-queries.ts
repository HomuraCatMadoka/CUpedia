import { revalidateTag, unstable_cache } from "next/cache";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenDishComments,
  canteenMenuItems,
  canteens,
  users,
} from "@/db/schema";
import {
  ADMIN_DISH_COMMENT_LIST_LIMIT,
  type AdminDishComment,
} from "@/lib/canteen-types";

export const CANTEEN_COMMENT_COUNTS_TAG = "canteen-comment-counts";

export async function countCommentsForCanteen(
  canteenId: string,
): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(canteenDishComments)
    .innerJoin(
      canteenMenuItems,
      eq(canteenDishComments.menuItemId, canteenMenuItems.id),
    )
    .where(eq(canteenMenuItems.canteenId, canteenId));
  return result[0]?.value ?? 0;
}

export async function countCommentsForMenuItem(
  menuItemId: string,
): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(canteenDishComments)
    .where(eq(canteenDishComments.menuItemId, menuItemId));
  return result[0]?.value ?? 0;
}

/** Per-menu-item comment totals for a canteen (menu + ranking labels). */
export async function countCommentsByMenuItemForCanteen(
  canteenId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      menuItemId: canteenDishComments.menuItemId,
      value: count(),
    })
    .from(canteenDishComments)
    .innerJoin(
      canteenMenuItems,
      eq(canteenDishComments.menuItemId, canteenMenuItems.id),
    )
    .where(
      and(
        eq(canteenMenuItems.canteenId, canteenId),
        eq(canteenMenuItems.isAvailable, true),
      ),
    )
    .groupBy(canteenDishComments.menuItemId);

  return Object.fromEntries(rows.map((row) => [row.menuItemId, row.value]));
}

const getCachedCommentCountsByMenuItem = unstable_cache(
  countCommentsByMenuItemForCanteen,
  ["canteen-comment-counts"],
  { tags: [CANTEEN_COMMENT_COUNTS_TAG], revalidate: 60 },
);

/** Cached per-item comment totals for the public canteen menu. */
export async function getCachedCommentCountsForCanteen(
  canteenId: string,
): Promise<Record<string, number>> {
  return getCachedCommentCountsByMenuItem(canteenId);
}

export function revalidateCanteenCommentCountsCache() {
  revalidateTag(CANTEEN_COMMENT_COUNTS_TAG, "max");
}

/** Newest-first site-wide dish comments for admin moderation. */
export async function adminListRecentDishComments(
  limit = ADMIN_DISH_COMMENT_LIST_LIMIT,
): Promise<AdminDishComment[]> {
  const rows = await db
    .select({
      id: canteenDishComments.id,
      menuItemId: canteenDishComments.menuItemId,
      userId: canteenDishComments.userId,
      content: canteenDishComments.content,
      createdAt: canteenDishComments.createdAt,
      updatedAt: canteenDishComments.updatedAt,
      authorNickname: users.nickname,
      authorEmail: users.email,
      canteenId: canteens.id,
      canteenName: canteens.name,
      menuItemName: canteenMenuItems.name,
    })
    .from(canteenDishComments)
    .innerJoin(users, eq(canteenDishComments.userId, users.id))
    .innerJoin(
      canteenMenuItems,
      eq(canteenDishComments.menuItemId, canteenMenuItems.id),
    )
    .innerJoin(canteens, eq(canteenMenuItems.canteenId, canteens.id))
    .orderBy(desc(canteenDishComments.createdAt), desc(canteenDishComments.id))
    .limit(limit);

  return rows;
}
