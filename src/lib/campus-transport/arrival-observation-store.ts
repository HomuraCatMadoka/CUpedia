import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  campusBusArrivalObservations,
  campusBusFeedbackRateLimits,
} from "@/db/schema";

type ArrivalObservationTransaction = Pick<
  typeof db,
  "execute" | "insert" | "select"
>;

export type ArrivalObservationInsert =
  typeof campusBusArrivalObservations.$inferInsert;

export function getCampusBusFeedbackRateLimitPerTenMinutes() {
  const raw = process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN;
  const parsed = raw ? Number(raw) : 12;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 12;
}

export async function assertArrivalFeedbackRateLimitInTransaction(
  sessionId: string,
  database: ArrivalObservationTransaction,
  now: Date,
) {
  const limit = getCampusBusFeedbackRateLimitPerTenMinutes();
  const windowDurationMilliseconds = 10 * 60_000;
  const expiresAt = new Date(now.getTime() + 60 * 60_000);

  await database.execute(sql`
    delete from ${campusBusFeedbackRateLimits}
    where ${campusBusFeedbackRateLimits.sessionId} in (
      select ${campusBusFeedbackRateLimits.sessionId}
      from ${campusBusFeedbackRateLimits}
      where ${campusBusFeedbackRateLimits.expiresAt} < ${now}
      order by ${campusBusFeedbackRateLimits.expiresAt}, ${campusBusFeedbackRateLimits.sessionId}
      limit 100
    )
  `);
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`campus-bus-feedback:${sessionId}`}, 0))`,
  );
  const rows = await database
    .select({
      value: campusBusFeedbackRateLimits.submissionCount,
      windowStartedAt: campusBusFeedbackRateLimits.windowStartedAt,
    })
    .from(campusBusFeedbackRateLimits)
    .where(eq(campusBusFeedbackRateLimits.sessionId, sessionId));
  const existing = rows[0];
  const isCurrentWindow = Boolean(
    existing &&
    existing.windowStartedAt.getTime() + windowDurationMilliseconds >
      now.getTime(),
  );
  if (isCurrentWindow && existing!.value >= limit) {
    throw new Error("CAMPUS_BUS_FEEDBACK_RATE_LIMIT_EXCEEDED");
  }
  const windowStartedAt = isCurrentWindow ? existing!.windowStartedAt : now;
  const submissionCount = isCurrentWindow ? existing!.value + 1 : 1;
  await database
    .insert(campusBusFeedbackRateLimits)
    .values({ expiresAt, sessionId, submissionCount, windowStartedAt })
    .onConflictDoUpdate({
      target: campusBusFeedbackRateLimits.sessionId,
      set: { expiresAt, submissionCount, windowStartedAt },
    });
}

export async function insertArrivalObservation(
  values: ArrivalObservationInsert,
  sessionId: string,
  receivedAt: Date,
) {
  return db.transaction(async (tx) => {
    await assertArrivalFeedbackRateLimitInTransaction(
      sessionId,
      tx,
      receivedAt,
    );
    const [observation] = await tx
      .insert(campusBusArrivalObservations)
      .values({ ...values, receivedAt })
      .returning({ id: campusBusArrivalObservations.id });
    return observation;
  });
}
