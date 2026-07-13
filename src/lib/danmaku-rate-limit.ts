import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { danmakuMessages } from "@/db/schema";

export function getDanmakuRateLimitPerHour(): number {
  const raw = process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
  const n = raw ? Number(raw) : 5;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

/** Shared DB-backed hourly limit — works across serverless instances. */
export async function assertDanmakuRateLimit(userId: string): Promise<void> {
  const limit = getDanmakuRateLimitPerHour();
  const windowStart = new Date(Date.now() - 3_600_000);
  const result = await db
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
