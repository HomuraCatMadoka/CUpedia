import { Client } from "pg";
import { test, expect, type Browser } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const targetEmail = "user@test.com";

async function query(text: string, values: unknown[] = []) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

async function resetTarget() {
  await query("update users set banned = false where email = $1", [
    targetEmail,
  ]);
  await query(
    "delete from sessions where user_id = (select id from users where email = $1)",
    [targetEmail],
  );
}

async function openFreshLogin(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("CUHK 邮箱").fill(targetEmail);
  await page.getByLabel("密码").fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  return { context, page };
}

test.beforeEach(resetTarget);
test.afterEach(resetTarget);

test("#246 admin bans and unbans a regular user", async ({ page, browser }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/users?q=${encodeURIComponent(targetEmail)}`);

  const target = page.getByRole("row").filter({ hasText: targetEmail });
  await expect(target.getByText("正常", { exact: true })).toBeVisible();
  await target.getByRole("button", { name: "封禁" }).click();
  await expect(page.getByRole("heading", { name: "确认封禁" })).toBeVisible();
  await page.getByRole("button", { name: "确认封禁" }).click();
  await expect(target.getByText("已封禁", { exact: true })).toBeVisible();

  const bannedLogin = await openFreshLogin(browser);
  await expect(bannedLogin.page).toHaveURL(/\/login/);
  const bannedSession = await bannedLogin.page.request.get(
    "/api/auth/get-session",
  );
  expect(await bannedSession.json()).toBeNull();
  await bannedLogin.context.close();

  await target.getByRole("button", { name: "解封" }).click();
  await expect(target.getByText("正常", { exact: true })).toBeVisible();

  const restoredLogin = await openFreshLogin(browser);
  await restoredLogin.page.waitForURL("**/wiki");
  const restoredSession = await restoredLogin.page.request.get(
    "/api/auth/get-session",
  );
  expect((await restoredSession.json()).user.email).toBe(targetEmail);
  await restoredLogin.context.close();
});

test("#246 admins and the current admin have no ban action", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/admin/users?q=admin@test.com");

  const admin = page.getByRole("row").filter({ hasText: "admin@test.com" });
  await expect(admin.getByRole("cell", { name: /admin站长/ })).toBeVisible();
  await expect(admin.getByText("站长", { exact: true })).toBeVisible();
  await expect(admin.getByText("当前用户", { exact: true })).toBeVisible();
  await expect(admin.getByRole("button", { name: "封禁" })).toHaveCount(0);
});
