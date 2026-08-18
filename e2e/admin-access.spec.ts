import { test, expect } from "@playwright/test";

/**
 * Guards that the admin shell renders for an authenticated admin (ref #198).
 * The admin layout mounts <Navbar/>, which calls useSidebar(); before the fix
 * no <SidebarProvider> wrapped it, so that hook threw and every /admin/* route
 * returned 500 — a latent bug that only surfaced once production gained its
 * first admin.
 */

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";
const ADMIN_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/deleted",
  "/admin/settings",
];

test("admin shell renders on every admin route", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("CUHK 邮箱").fill(ADMIN_EMAIL);
  await page.getByLabel("密码").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL("/");

  for (const route of ADMIN_ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), `${route} should not 500`).toBe(200);
    await expect(page.getByText("管理后台")).toBeVisible();
    if (route === "/admin") {
      await expect(page.getByText("近 7 日新增评价")).toBeVisible();
      await expect(page.getByText("评价总数", { exact: true })).toBeVisible();
      await expect(page.getByText("含文字评价", { exact: true })).toBeVisible();
      await expect(page.getByText("仅评分", { exact: true })).toBeVisible();
      await expect(page.getByText("科目总数", { exact: true })).toBeVisible();
    }
  }
});
