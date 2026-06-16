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
const ADMIN_ROUTES = ["/admin/users", "/admin/deleted", "/admin/settings"];

test("admin shell renders on every admin route", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("CUHK 邮箱").fill(ADMIN_EMAIL);
  await page.getByLabel("密码").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/wiki$/);

  for (const route of ADMIN_ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), `${route} should not 500`).toBe(200);
    await expect(page.getByText("管理后台")).toBeVisible();
  }
});
