import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { canteenDishComments, canteenMenuItems } from "@/db/schema";

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
