import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { canteenShameVotes } from "@/db/schema";

export async function appendAnonymousShameVote({
  canteenId,
  anonymousSessionId,
  voteDate,
  limit,
}: {
  canteenId: string;
  anonymousSessionId: string;
  voteDate: string;
  limit: number;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const lockKey = `canteen-shame:${anonymousSessionId}:${voteDate}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(canteenShameVotes)
      .where(
        and(
          eq(canteenShameVotes.anonymousSessionId, anonymousSessionId),
          eq(canteenShameVotes.voteDate, voteDate),
        ),
      );
    if ((row?.count ?? 0) >= limit) throw new Error("DAILY_LIMIT_EXCEEDED");
    await tx.insert(canteenShameVotes).values({
      canteenId,
      voteDate,
      userId: null,
      anonymousSessionId,
    });
  });
}
