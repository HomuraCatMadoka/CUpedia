import { createHash } from "node:crypto";

import { and, count, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { campusBusArrivalObservations } from "@/db/schema";

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

export function arrivalFeedbackRateLimitKey(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const address =
    forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  const secret =
    process.env.CAMPUS_BUS_FEEDBACK_HASH_SECRET ||
    process.env.AUTH_SECRET ||
    "campus-bus-feedback-development";
  return createHash("sha256")
    .update(secret)
    .update("\0")
    .update(address)
    .digest("hex");
}

export async function assertArrivalFeedbackRateLimitInTransaction(
  rateLimitKeyHash: string,
  database: ArrivalObservationTransaction,
  now: Date,
) {
  const limit = getCampusBusFeedbackRateLimitPerTenMinutes();
  const windowStart = new Date(now.getTime() - 10 * 60_000);

  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`campus-bus-feedback:${rateLimitKeyHash}`}, 0))`,
  );
  const rows = await database
    .select({ value: count() })
    .from(campusBusArrivalObservations)
    .where(
      and(
        eq(campusBusArrivalObservations.rateLimitKeyHash, rateLimitKeyHash),
        gte(campusBusArrivalObservations.receivedAt, windowStart),
      ),
    );
  if ((rows[0]?.value ?? 0) >= limit) {
    throw new Error("CAMPUS_BUS_FEEDBACK_RATE_LIMIT_EXCEEDED");
  }
}

export async function insertArrivalObservation(
  values: ArrivalObservationInsert,
  rateLimitKeyHash: string,
  receivedAt: Date,
) {
  return db.transaction(async (tx) => {
    await assertArrivalFeedbackRateLimitInTransaction(
      rateLimitKeyHash,
      tx,
      receivedAt,
    );
    const [observation] = await tx
      .insert(campusBusArrivalObservations)
      .values({ ...values, rateLimitKeyHash, receivedAt })
      .returning({ id: campusBusArrivalObservations.id });
    return observation;
  });
}
