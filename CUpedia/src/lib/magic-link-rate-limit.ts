import { db } from "@/db";
import { users, magicLinkRateLimits } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { parseEmail, isAllowedEmail } from "@/lib/email";

const RATE_LIMIT_SECONDS = 60;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  return new Date(val as string);
}

type PeekResult =
  | { ok: true }
  | {
      ok: false;
      code: "INVALID_EMAIL" | "INVALID_EMAIL_DOMAIN" | "RATE_LIMITED" | "SUPPRESSED";
      retryAfterSeconds?: number;
    };

type ConsumeResult =
  | { ok: true }
  | {
      ok: false;
      code: "INVALID_EMAIL" | "INVALID_EMAIL_DOMAIN" | "BANNED" | "RATE_LIMITED";
      retryAfterSeconds?: number;
    };

export async function peekMagicLinkRateLimit(
  email: string,
  now = new Date()
): Promise<PeekResult> {
  const parsed = parseEmail(email);
  if (!parsed.ok) return { ok: false, code: "INVALID_EMAIL" };
  if (!isAllowedEmail(parsed.email))
    return { ok: false, code: "INVALID_EMAIL_DOMAIN" };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.email),
    columns: { banned: true },
  });
  if (existing?.banned) return { ok: false, code: "SUPPRESSED" };

  const result = (await db.execute(
    sql`SELECT last_attempted_at FROM ${magicLinkRateLimits} WHERE ${magicLinkRateLimits.identifier} = ${parsed.email}`
  )) as any;
  const rows = result.rows ?? result;
  if (rows.length > 0) {
    const lastAttemptedAt = toDate(rows[0].last_attempted_at);
    const elapsed = (now.getTime() - lastAttemptedAt.getTime()) / 1000;
    if (elapsed < RATE_LIMIT_SECONDS) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        retryAfterSeconds: Math.ceil(RATE_LIMIT_SECONDS - elapsed),
      };
    }
  }

  return { ok: true };
}

export async function consumeMagicLinkRateLimit(
  email: string,
  attemptedAt = new Date()
): Promise<ConsumeResult> {
  const parsed = parseEmail(email);
  if (!parsed.ok) return { ok: false, code: "INVALID_EMAIL" };
  if (!isAllowedEmail(parsed.email))
    return { ok: false, code: "INVALID_EMAIL_DOMAIN" };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.email),
    columns: { banned: true },
  });
  if (existing?.banned) return { ok: false, code: "BANNED" };

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`INSERT INTO ${magicLinkRateLimits} (identifier, last_attempted_at, updated_at)
          VALUES (${parsed.email}, to_timestamp(0), to_timestamp(0))
          ON CONFLICT (identifier) DO NOTHING`
    );

    const lockResult = (await tx.execute(
      sql`SELECT last_attempted_at FROM ${magicLinkRateLimits}
          WHERE ${magicLinkRateLimits.identifier} = ${parsed.email}
          FOR UPDATE`
    )) as any;
    const lockRows = lockResult.rows ?? lockResult;

    const lastAttemptedAt = toDate(lockRows[0].last_attempted_at);
    const elapsed =
      (attemptedAt.getTime() - lastAttemptedAt.getTime()) / 1000;

    if (elapsed < RATE_LIMIT_SECONDS) {
      return {
        ok: false as const,
        code: "RATE_LIMITED" as const,
        retryAfterSeconds: Math.ceil(RATE_LIMIT_SECONDS - elapsed),
      };
    }

    await tx.execute(
      sql`UPDATE ${magicLinkRateLimits}
          SET last_attempted_at = ${attemptedAt}, updated_at = ${attemptedAt}
          WHERE ${magicLinkRateLimits.identifier} = ${parsed.email}`
    );

    return { ok: true as const };
  });
}
