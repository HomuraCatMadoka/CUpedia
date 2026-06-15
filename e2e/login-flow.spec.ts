import { test, expect } from "@playwright/test";

/**
 * Password sign-in through the real login UI.
 *
 * ref #195 — every existing auth spec logs in via `page.request` (a cookie-less
 *   Node call that carries no browser Origin header), so better-auth's CSRF
 *   origin check never ran in e2e and a mismatched `AUTH_URL` stayed hidden.
 *   This spec drives the actual form submit (Origin = the e2e port) and only
 *   passes once `AUTH_URL` is pinned to the e2e origin in playwright.config.ts.
 * ref #182 — the same flow proves the client-side CUHK-domain gate is gone:
 *   a @test.com seed account reaches better-auth instead of being rejected
 *   before submit.
 */

const SEED_EMAIL = "user@test.com";
const SEED_PASSWORD = "password123";

test("seed account signs in through the password login UI", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("CUHK 邮箱").fill(SEED_EMAIL);
  await page.getByLabel("密码").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();

  // No domain gate and no CSRF origin rejection: the submit reaches better-auth
  // and we land on /wiki.
  await expect(page.getByText("仅支持 CUHK 邮箱")).toHaveCount(0);
  await expect(page).toHaveURL(/\/wiki$/);

  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json())?.user?.email).toBe(SEED_EMAIL);
});
