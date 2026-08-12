import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { campusBusArrivalObservations } from "@/db/schema";
import { insertArrivalObservation } from "@/lib/campus-transport/arrival-observation-store";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("campus bus concurrent feedback rate limit", () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;
  let previousLimit: string | undefined;
  const rateLimitKeyHash = randomUUID().replaceAll("-", "");

  beforeAll(() => {
    previousLimit = process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN;
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = "3";
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = drizzle(pool);
  });

  afterAll(async () => {
    await database
      ?.delete(campusBusArrivalObservations)
      .where(
        eq(campusBusArrivalObservations.rateLimitKeyHash, rateLimitKeyHash),
      );
    if (previousLimit === undefined) {
      delete process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN;
    } else {
      process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = previousLimit;
    }
    await pool?.end();
  });

  it("atomically caps concurrent anonymous writes", async () => {
    const now = new Date();
    const attempts = Array.from({ length: 8 }, (_, index) =>
      insertArrivalObservation(
        {
          modelRevisionId: "test-cold-start",
          observedArrivalAt: new Date(now.getTime() - index * 1_000),
          routeId: "2",
          stopId: "cuhk-wp-stop-2550",
          stopOccurrenceId: "cuhk-wp-stop-2550#1",
          submittedAnonymously: true,
        },
        rateLimitKeyHash,
        now,
      ),
    );

    const results = await Promise.allSettled(attempts);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(3);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(5);

    const rows = await database
      .select({ value: count() })
      .from(campusBusArrivalObservations)
      .where(
        eq(campusBusArrivalObservations.rateLimitKeyHash, rateLimitKeyHash),
      );
    expect(rows[0]?.value).toBe(3);
  });
});
