import { test, expect } from "@playwright/test";
import { Client } from "pg";

/**
 * Registration must (a) actually set the password and (b) log the user in.
 * Regression: the route called setPassword with the cookie-less browser
 * headers (UNAUTHORIZED, silently swallowed → no credential account → password
 * login always 401) and discarded signInEmailOTP's Set-Cookie (no auto-login).
 */

const EMAIL = "1155990001@link.cuhk.edu.hk";
const OTP = "424242";
const PASSWORD = "register-flow-pw";

/** The OTP plugin stores codes plain under "sign-in-otp-<email>". */
async function seedOtp() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into verifications (identifier, value, expires_at)
       values ($1, $2, now() + interval '5 minutes')`,
      [`sign-in-otp-${EMAIL}`, OTP],
    );
  } finally {
    await client.end();
  }
}

test("register sets the password and logs the user in", async ({
  page,
  request,
}) => {
  await seedOtp();

  const res = await page.request.post("/api/auth/register", {
    data: { email: EMAIL, otp: OTP, password: PASSWORD, nickname: "回归测试" },
  });
  expect(res.status()).toBe(200);

  // Auto-login: the register response must carry the session cookie.
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name.includes("session_token"))).toBe(true);

  // The session is live and serves the fresh nickname, not a stale cache.
  const session = await page.request.get("/api/auth/get-session");
  const body = await session.json();
  expect(body?.user?.email).toBe(EMAIL);
  expect(body?.user?.nickname).toBe("回归测试");

  // Password actually set: email+password sign-in succeeds from a fresh,
  // cookie-less client (a cookie-bearing one trips better-auth's CSRF origin
  // check here, since AUTH_URL points at the dev port, not the e2e one).
  const login = await request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  // check-email reflects the now-registered state.
  const check = await request.post("/api/auth/check-email", {
    data: { email: EMAIL },
  });
  expect((await check.json()).registered).toBe(true);

  // A registered email cannot re-register — blocked before OTP validation
  // (so the bogus OTP never matters), preventing silent password/nickname
  // clobber. 409, not 200.
  const dup = await request.post("/api/auth/register", {
    data: {
      email: EMAIL,
      otp: "000000",
      password: "another-pw-1",
      nickname: "重复",
    },
  });
  expect(dup.status()).toBe(409);
});
