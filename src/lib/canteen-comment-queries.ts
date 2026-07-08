import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { canteenDishComments, canteenMenuItems } from "@/db/schema";

export async function countCommentsForCanteen(canteenId: string): Promise<number> {
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
