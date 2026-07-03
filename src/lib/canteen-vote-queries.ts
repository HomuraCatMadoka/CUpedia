import { and, count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { canteenDishVotes, canteenMenuItems } from "@/db/schema";

export const CANTEEN_VOTE_COUNTS_TAG = "canteen-vote-counts";

export async function countVotesForCanteen(canteenId: string): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(canteenDishVotes)
    .innerJoin(
      canteenMenuItems,
      eq(canteenDishVotes.menuItemId, canteenMenuItems.id),
    )
    .where(
      and(
        eq(canteenMenuItems.canteenId, canteenId),
        isNotNull(canteenDishVotes.vote),
      ),
    );
  return result[0]?.value ?? 0;
}

export async function countVotesForMenuItem(menuItemId: string): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(canteenDishVotes)
    .where(
      and(
        eq(canteenDishVotes.menuItemId, menuItemId),
        isNotNull(canteenDishVotes.vote),
      ),
    );
  return result[0]?.value ?? 0;
}
