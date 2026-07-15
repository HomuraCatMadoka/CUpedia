import { test, expect } from "@playwright/test";

/**
 * Drives the real /login form through better-auth — the first e2e to do so via
 * a browser rather than the header-less API helpers other specs use. It guards
 * two things at once: the password form no longer domain-gates @test.com seed
 * accounts (ref #182), and the e2e server declares a self-consistent AUTH_URL
 * so the browser Origin (:3100) clears better-auth's CSRF check (ref #195).
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

  // No domain gate, and no "Invalid origin": the submit reaches better-auth
  // and lands on the site home, authenticated.
  await expect(page.getByText("仅支持 CUHK 邮箱")).toHaveCount(0);
  await expect(page).toHaveURL("/");

  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json())?.user?.email).toBe(SEED_EMAIL);
});
