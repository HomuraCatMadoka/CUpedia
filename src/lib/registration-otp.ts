import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { verifications } from "@/db/schema";
import { normalizeEmail } from "@/lib/email";

const MAX_ATTEMPTS = 3;

function matchesOtp(storedOtp: string, suppliedOtp: string): boolean {
  const stored = Buffer.from(storedOtp);
  const supplied = Buffer.from(suppliedOtp);
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

export async function checkRegistrationOtp(
  email: string,
  otp: string,
): Promise<boolean> {
  const identifier = `sign-in-otp-${normalizeEmail(email)}`;
  return db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`SELECT id, value,
                 expires_at <= (now() AT TIME ZONE 'UTC') AS expired
          FROM ${verifications}
          WHERE ${verifications.identifier} = ${identifier}
          ORDER BY ${verifications.createdAt} DESC
          LIMIT 1
          FOR UPDATE`,
    );
    const rows = (result.rows ?? result) as {
      id: string;
      value: string;
      expired: boolean;
    }[];
    const verification = rows[0];

    if (!verification) return false;

    if (verification.expired) {
      await tx
        .delete(verifications)
        .where(eq(verifications.identifier, identifier));
      return false;
    }

    const separator = verification.value.lastIndexOf(":");
    const storedOtp = verification.value.slice(0, separator);
    const attempts = Number.parseInt(
      verification.value.slice(separator + 1),
      10,
    );
    if (
      separator < 0 ||
      !Number.isSafeInteger(attempts) ||
      attempts >= MAX_ATTEMPTS
    ) {
      await tx
        .delete(verifications)
        .where(eq(verifications.identifier, identifier));
      return false;
    }

    if (matchesOtp(storedOtp, otp)) return true;

    await tx
      .update(verifications)
      .set({ value: `${storedOtp}:${attempts + 1}`, updatedAt: new Date() })
      .where(eq(verifications.id, verification.id));
    return false;
  });
}
