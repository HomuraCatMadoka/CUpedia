import { expect } from "@playwright/test";
import { Client } from "pg";

type OtpType = "sign-in" | "forget-password";

function identifier(email: string, type: OtpType) {
  return `${type}-otp-${email}`;
}

async function query<T>(text: string, values: unknown[] = []) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query<T & Record<string, unknown>>(text, values);
  } finally {
    await client.end();
  }
}

export async function readLatestOtp(email: string, type: OtpType) {
  let otp = "";
  await expect
    .poll(async () => {
      const result = await query<{ value: string }>(
        `select value from verifications
         where identifier = $1
         order by created_at desc
         limit 1`,
        [identifier(email, type)],
      );
      otp = result.rows[0]?.value.split(":", 1)[0] ?? "";
      return otp;
    })
    .toMatch(/^\d{6}$/);
  return otp;
}

export async function expireLatestOtp(email: string, type: OtpType) {
  await query(
    `update verifications set expires_at = now() - interval '1 second'
     where identifier = $1`,
    [identifier(email, type)],
  );
}

export async function userExists(email: string) {
  const result = await query(`select 1 from users where email = $1 limit 1`, [
    email,
  ]);
  return result.rowCount === 1;
}
