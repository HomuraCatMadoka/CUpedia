import { test, expect } from "@playwright/test";
import { randomInt } from "node:crypto";
import { Client } from "pg";

/**
 * Password reset is a SEPARATE entry point from registration (better-auth's
 * native email-otp reset). This verifies the round trip: a registered user
 * resets via a forget-password OTP, the new password works, the old one fails.
 */

const EMAIL = `1155${randomInt(1_000_000).toString().padStart(6, "0")}@link.cuhk.edu.hk`;
const REGISTER_OTP = "111111";
const RESET_OTP = "222222";
const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "new-password-2";

/** OTP plugin stores codes plain; sign-in uses "sign-in-otp-<email>",
 * password reset uses "forget-password-otp-<email>". */
async function seedOtp(identifier: string, otp: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into verifications (identifier, value, expires_at)
       values ($1, $2, now() + interval '5 minutes')`,
      [identifier, otp],
    );
  } finally {
    await client.end();
  }
}

test("reset password: new password works, old one is rejected", async ({
  page,
  request,
}) => {
  // Arrange: register the account (sign-in OTP path). Use page.request so the
  // session cookie register sets lands in a DIFFERENT jar than the `request`
  // fixture below — a cookie-bearing sign-in trips better-auth's origin check.
  await seedOtp(`sign-in-otp-${EMAIL}`, REGISTER_OTP);
  const reg = await page.request.post("/api/auth/register", {
    data: {
      email: EMAIL,
      otp: REGISTER_OTP,
      password: OLD_PASSWORD,
      nickname: "重置测试",
    },
  });
  expect(reg.status()).toBe(200);

  // Act: reset via a forget-password OTP.
  await seedOtp(`forget-password-otp-${EMAIL}`, RESET_OTP);
  const reset = await request.post("/api/auth/email-otp/reset-password", {
    data: { email: EMAIL, otp: RESET_OTP, password: NEW_PASSWORD },
  });
  expect(reset.status()).toBe(200);

  // Assert: the new password signs in, the old one no longer does.
  const oldLogin = await request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: OLD_PASSWORD },
  });
  expect(oldLogin.status()).toBe(401);

  const newLogin = await request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: NEW_PASSWORD },
  });
  expect(newLogin.status()).toBe(200);
});

test("reset-password endpoint rejects a non-CUHK email", async ({
  request,
}) => {
  const res = await request.post("/api/auth/email-otp/request-password-reset", {
    data: { email: "attacker@gmail.com" },
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain("CUHK");
});
