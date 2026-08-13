import { randomUUID } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  campusBusArrivalObservations,
  campusBusFeedbackRateLimits,
} from "@/db/schema";
import { insertArrivalObservation } from "@/lib/campus-transport/arrival-observation-store";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("campus bus concurrent feedback rate limit", () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;
  let previousLimit: string | undefined;
  const sessionId = randomUUID();

  beforeAll(() => {
    previousLimit = process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN;
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = "3";
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = drizzle(pool);
  });

  afterAll(async () => {
    await database?.execute(
      sql`alter table campus_bus_arrival_observations disable trigger campus_bus_arrival_observations_immutable`,
    );
    await database
      ?.delete(campusBusArrivalObservations)
      .where(eq(campusBusArrivalObservations.routeId, sessionId));
    await database?.execute(
      sql`alter table campus_bus_arrival_observations enable trigger campus_bus_arrival_observations_immutable`,
    );
    await database
      ?.delete(campusBusFeedbackRateLimits)
      .where(eq(campusBusFeedbackRateLimits.sessionId, sessionId));
    if (previousLimit === undefined) {
      delete process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN;
    } else {
      process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = previousLimit;
    }
    await pool?.end();
  });

  it("atomically caps concurrent anonymous writes", async () => {
    const now = new Date("2000-01-01T00:00:00.000Z");
    const attempts = Array.from({ length: 8 }, (_, index) =>
      insertArrivalObservation(
        {
          observedArrivalAt: new Date(now.getTime() - index * 1_000),
          routeId: sessionId,
          stopId: "test-stop",
          stopOccurrenceId: "test-stop#1",
          submittedAnonymously: true,
        },
        sessionId,
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
      .where(eq(campusBusArrivalObservations.routeId, sessionId));
    expect(rows[0]?.value).toBe(3);
  });

  it("rejects mutation or deletion of stored observations", async () => {
    async function expectImmutable(operation: Promise<unknown>) {
      try {
        await operation;
        throw new Error("observation mutation unexpectedly succeeded");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { cause?: Error }).cause?.message).toContain(
          "campus bus arrival observations are immutable",
        );
      }
    }

    await expectImmutable(
      database
        .update(campusBusArrivalObservations)
        .set({ routeId: "mutated" })
        .where(eq(campusBusArrivalObservations.routeId, sessionId)),
    );
    await expectImmutable(
      database
        .delete(campusBusArrivalObservations)
        .where(eq(campusBusArrivalObservations.routeId, sessionId)),
    );
  });
});
