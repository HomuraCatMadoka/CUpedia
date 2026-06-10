import { test, expect } from "@playwright/test";

/**
 * #182: the login page must let seed accounts (@test.com) sign in by password.
 * The old client-side CUHK-domain gate rejected the submit before it reached
 * better-auth. This drives the real login UI (not the API helper other specs
 * use to work around the gate) to prove the fix end-to-end.
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

  // No domain gate: the submit reaches better-auth and we land on /wiki.
  await expect(page.getByText("仅支持 CUHK 邮箱")).toHaveCount(0);
  await expect(page).toHaveURL(/\/wiki$/);

  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json())?.user?.email).toBe(SEED_EMAIL);
});
