import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { canteens, canteenShameVotes } from "@/db/schema";
import { appendAnonymousShameVote } from "@/lib/canteen-shame-vote-store";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("canteen shame vote concurrent daily limit", () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;
  let canteenId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = drizzle(pool);
    const [canteen] = await database
      .insert(canteens)
      .values({ name: `踩票并发测试-${randomUUID()}`, location: "test" })
      .returning({ id: canteens.id });
    canteenId = canteen.id;
  });

  afterAll(async () => {
    if (canteenId) {
      await database.delete(canteens).where(eq(canteens.id, canteenId));
    }
    await pool?.end();
  });

  it("atomically caps concurrent anonymous votes for one HKT day", async () => {
    const anonymousSessionId = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        appendAnonymousShameVote({
          canteenId,
          anonymousSessionId,
          voteDate: "2099-01-01",
          limit: 3,
        }),
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(3);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof Error &&
          result.reason.message === "DAILY_LIMIT_EXCEEDED",
      ),
    ).toHaveLength(7);

    const rows = await database
      .select({ value: count() })
      .from(canteenShameVotes)
      .where(eq(canteenShameVotes.anonymousSessionId, anonymousSessionId));
    expect(rows[0]?.value).toBe(3);
  });
});
