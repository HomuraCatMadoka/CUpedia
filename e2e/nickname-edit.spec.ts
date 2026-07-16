import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";

test.describe("#349 nickname editing", () => {
  test.afterEach(async ({ page }) => {
    const response = await page.request.post("/api/auth/nickname", {
      data: { nickname: "TestUser" },
    });
    expect(response.ok()).toBe(true);
  });

  test("opens the nickname dialog with the current nickname", async ({
    page,
  }) => {
    await loginWithPassword(page, "user@test.com", "password123");
    await page.goto("/");

    await page.getByRole("button", { name: "TestUser" }).click();
    await page.getByRole("menuitem", { name: "修改昵称" }).click();

    const dialog = page.getByRole("dialog", { name: "修改昵称" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("输入新昵称")).toHaveValue("TestUser");
  });

  test("persists a saved nickname across reloads", async ({ page }) => {
    await loginWithPassword(page, "user@test.com", "password123");
    await page.goto("/");

    await page.getByRole("button", { name: "TestUser" }).click();
    await page.getByRole("menuitem", { name: "修改昵称" }).click();
    await page.getByPlaceholder("输入新昵称").fill("新昵称");
    await page.getByRole("button", { name: "保存", exact: true }).click();

    await expect(page.getByRole("dialog", { name: "修改昵称" })).toBeHidden();
    await page.reload();
    await expect(page.getByRole("button", { name: "新昵称" })).toBeVisible();
  });
});
