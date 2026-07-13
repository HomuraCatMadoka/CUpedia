import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginWithPassword } from "./helpers/auth";

const promotedEmail = "contributor@test.com";

async function query(text: string, values: unknown[] = []) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

async function resetGovernance() {
  await query(
    "update users set role = 'user', banned = false where email = $1",
    [promotedEmail],
  );
  await query(
    "update site_settings set value = 'admin' where key = 'wiki_edit_role'",
  );
  await query(
    "delete from sessions where user_id in (select id from users where email in ($1, $2))",
    [promotedEmail, "user@test.com"],
  );
}

test.beforeEach(resetGovernance);
test.afterEach(resetGovernance);

test("#250 owner role governance and immediate wiki edit policy", async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/users?q=${encodeURIComponent(promotedEmail)}`);
  const promoted = page.getByRole("row").filter({ hasText: promotedEmail });
  await promoted.getByRole("button", { name: "设为管理员" }).click();
  await page.getByRole("button", { name: "确认设为管理员" }).click();
  await expect(promoted.getByText("admin", { exact: true })).toBeVisible();

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await loginWithPassword(manager, promotedEmail, "password123");
  await manager.goto("/admin/users?q=user@test.com");
  const regular = manager.getByRole("row").filter({ hasText: "user@test.com" });
  await expect(regular.getByRole("button", { name: "封禁" })).toBeVisible();
  await expect(
    regular.getByRole("button", { name: /设为管理员|取消管理员/ }),
  ).toHaveCount(0);

  const userContext = await browser.newContext();
  const user = await userContext.newPage();
  await loginWithPassword(user, "user@test.com", "password123");
  await user.goto("/wiki/new");
  await expect(user).toHaveURL(/\/wiki$/);
  await user.goto("/wiki/edit/rich-content-demo");
  await expect(user).toHaveURL(/\/wiki$/);
  await user.goto("/wiki/history/rich-content-demo");
  await user.getByRole("link", { name: "查看" }).first().click();
  await expect(user.getByRole("button", { name: "回滚到此版本" })).toHaveCount(
    0,
  );

  await manager.goto("/admin/settings");
  await manager.getByRole("switch", { name: "允许普通用户编辑 Wiki" }).click();
  await manager.getByRole("button", { name: "确认" }).click();
  await expect(
    manager.getByText("当前：所有登录用户均可创建、编辑和回滚页面"),
  ).toBeVisible();

  await user.goto("/wiki/new");
  await expect(user.getByLabel("标题")).toBeVisible();
  await user.goto("/wiki/edit/rich-content-demo");
  await expect(user.locator('[role="textbox"]').first()).toBeVisible();
  await user.goto("/wiki/history/rich-content-demo");
  await user.getByRole("link", { name: "查看" }).first().click();
  await expect(
    user.getByRole("button", { name: "回滚到此版本" }),
  ).toBeVisible();
  await userContext.close();
  await managerContext.close();

  await promoted.getByRole("button", { name: "取消管理员" }).click();
  await expect(promoted.getByText("user", { exact: true })).toBeVisible();
});
