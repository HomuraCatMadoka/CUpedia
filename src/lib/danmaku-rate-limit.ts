import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { canteenDanmakuMessages, danmakuMessages } from "@/db/schema";

type RateLimitTransaction = Pick<typeof db, "execute" | "select">;

export function getDanmakuRateLimitPerHour(): number {
  const raw = process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
  const n = raw ? Number(raw) : 5;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

/** Call only inside the same transaction that inserts the hub danmaku row. */
export async function assertDanmakuRateLimitInTransaction(
  userId: string,
  database: RateLimitTransaction,
  now = new Date(),
): Promise<void> {
  const limit = getDanmakuRateLimitPerHour();
  const windowStart = new Date(now.getTime() - 3_600_000);

  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`danmaku:hub:${userId}`}, 0))`,
  );

  const result = await database
    .select({ value: count() })
    .from(danmakuMessages)
    .where(
      and(
        eq(danmakuMessages.userId, userId),
        gte(danmakuMessages.createdAt, windowStart),
      ),
    );
  if ((result[0]?.value ?? 0) >= limit) {
    throw new Error("DANMAKU_RATE_LIMIT_EXCEEDED");
  }
}

/** Call only inside the same transaction that inserts the canteen danmaku row. */
export async function assertCanteenDanmakuRateLimitInTransaction(
  userId: string,
  canteenId: string,
  database: RateLimitTransaction,
  now = new Date(),
): Promise<void> {
  const limit = getDanmakuRateLimitPerHour();
  const windowStart = new Date(now.getTime() - 3_600_000);

  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`danmaku:canteen:${canteenId}:${userId}`}, 0))`,
  );

  const result = await database
    .select({ value: count() })
    .from(canteenDanmakuMessages)
    .where(
      and(
        eq(canteenDanmakuMessages.userId, userId),
        eq(canteenDanmakuMessages.canteenId, canteenId),
        gte(canteenDanmakuMessages.createdAt, windowStart),
      ),
    );

  if ((result[0]?.value ?? 0) >= limit) {
    throw new Error("DANMAKU_RATE_LIMIT_EXCEEDED");
  }
}
