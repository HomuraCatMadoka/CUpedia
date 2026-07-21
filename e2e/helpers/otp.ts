import { expect } from "@playwright/test";
import { Client } from "pg";

type OtpType = "sign-in" | "forget-password" | "email-verification";

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
    `update verifications
     set expires_at = (now() at time zone 'UTC') - interval '1 second'
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

export async function insertOtp(email: string, type: OtpType, otp: string) {
  await query(
    `insert into verifications (id, identifier, value, expires_at, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, now() + interval '10 minutes', now(), now())`,
    [identifier(email, type), `${otp}:0`],
  );
}

export async function createOtpOnlyUser(email: string, nickname = "") {
  const result = await query<{ id: string }>(
    `insert into users (id, name, email, email_verified, nickname, role, banned, created_at, updated_at)
     values (gen_random_uuid(), null, $1, true, $2, 'user', false, now(), now())
     returning id`,
    [email, nickname],
  );
  return result.rows[0].id;
}

export async function createEmptyCredentialAccount(userId: string) {
  await query(
    `insert into accounts
       (id, account_id, provider_id, user_id, password, created_at, updated_at)
     values (gen_random_uuid(), $1, 'credential', $2, '', now(), now())`,
    [userId, userId],
  );
}

export async function setUserNickname(email: string, nickname: string) {
  await query(
    `update users set nickname = $2, updated_at = now() where email = $1`,
    [email, nickname],
  );
}

export async function ageLatestSession(email: string) {
  await query(
    `update sessions
     set created_at = now() - interval '2 days'
     where id = (
       select sessions.id from sessions
       inner join users on users.id = sessions.user_id
       where users.email = $1
       order by sessions.created_at desc
       limit 1
     )`,
    [email],
  );
}
