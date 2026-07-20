import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { canteenDanmakuMessages, canteens, users } from "@/db/schema";
import { insertCanteenDanmakuForUser } from "@/lib/danmaku-mutations";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("canteen danmaku concurrent rate limit", () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;
  let user: { id: string; nickname: string };
  let canteenIds: [string, string];
  let previousLimit: string | undefined;

  beforeAll(async () => {
    previousLimit = process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
    process.env.DANMAKU_RATE_LIMIT_PER_HOUR = "2";
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = drizzle(pool);

    const suffix = randomUUID();
    const [createdUser] = await database
      .insert(users)
      .values({
        email: `danmaku-rate-limit-${suffix}@test.invalid`,
        nickname: "Rate Limit Test",
      })
      .returning({ id: users.id, nickname: users.nickname });
    user = createdUser;

    const createdCanteens = await database
      .insert(canteens)
      .values([
        { name: `并发测试甲-${suffix}`, location: "test" },
        { name: `并发测试乙-${suffix}`, location: "test" },
      ])
      .returning({ id: canteens.id });
    canteenIds = [createdCanteens[0].id, createdCanteens[1].id];
  });

  afterAll(async () => {
    if (user) await database.delete(users).where(eq(users.id, user.id));
    if (canteenIds) {
      await database.delete(canteens).where(eq(canteens.id, canteenIds[0]));
      await database.delete(canteens).where(eq(canteens.id, canteenIds[1]));
    }
    if (previousLimit === undefined) {
      delete process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
    } else {
      process.env.DANMAKU_RATE_LIMIT_PER_HOUR = previousLimit;
    }
    await pool?.end();
  });

  it("atomically caps concurrent writes while keeping canteen quotas separate", async () => {
    const attempts = canteenIds.flatMap((canteenId, canteenIndex) =>
      Array.from({ length: 5 }, (_, attemptIndex) =>
        insertCanteenDanmakuForUser(
          user,
          canteenId,
          `feed-${canteenIndex}-${attemptIndex}`,
        ),
      ),
    );

    const results = await Promise.allSettled(attempts);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(4);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(6);

    for (const canteenId of canteenIds) {
      const rows = await database
        .select({ value: count() })
        .from(canteenDanmakuMessages)
        .where(
          and(
            eq(canteenDanmakuMessages.userId, user.id),
            eq(canteenDanmakuMessages.canteenId, canteenId),
          ),
        );
      expect(rows[0]?.value).toBe(2);
    }
  });
});
