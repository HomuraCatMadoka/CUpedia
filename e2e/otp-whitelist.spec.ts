import { test, expect } from "@playwright/test";

/**
 * The eligible-account whitelist must be enforced server-side at the email-OTP
 * boundary, not only in the login/register page JS (which is bypassable). A
 * non-CUHK address must be rejected at BOTH the send and the verify endpoints —
 * otherwise better-auth would mail an OTP to, and auto-create an account for,
 * any email. Regression for the auth.ts before-hook.
 */

const BAD_EMAIL = "attacker@gmail.com";

test.describe("email-OTP eligible-account gate", () => {
  test("send-verification-otp rejects a non-CUHK email", async ({ page }) => {
    const res = await page.request.post(
      "/api/auth/email-otp/send-verification-otp",
      { data: { email: BAD_EMAIL, type: "sign-in" } },
    );
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("CUHK");
  });

  test("sign-in/email-otp rejects a non-CUHK email before OTP validation", async ({
    page,
  }) => {
    const res = await page.request.post("/api/auth/sign-in/email-otp", {
      data: { email: BAD_EMAIL, otp: "000000" },
    });
    expect(res.status()).toBe(400);
    // Whitelist error, not "invalid OTP" — proves the gate fires first.
    expect(await res.text()).toContain("CUHK");
  });

  test("an eligible email passes the gate (then fails on the bogus OTP)", async ({
    page,
  }) => {
    const res = await page.request.post("/api/auth/sign-in/email-otp", {
      data: { email: "1155123456@link.cuhk.edu.hk", otp: "000000" },
    });
    expect(res.status()).toBe(400);
    // Rejected by OTP validation, NOT the whitelist — the gate must not overreach.
    expect(await res.text()).not.toContain("CUHK");
  });
});
