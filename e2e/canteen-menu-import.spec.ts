import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("canteen menu OCR import", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("admin uploads menu image, proofreads, and publishes dishes", async ({
    page,
  }) => {
    const canteenName = `E2E导入食堂-${Date.now()}`;

    await page.goto("/admin/canteens");
    await page.getByLabel("食堂名称").fill(canteenName);
    await page.getByRole("button", { name: "添加食堂" }).click();
    await expect(page.getByText(canteenName)).toBeVisible();

    await page
      .getByRole("heading", { name: canteenName, exact: true })
      .locator('xpath=ancestor::div[contains(@class, "canteen-fade-in")][1]')
      .getByRole("link", { name: "管理菜单" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: /菜单/ }),
    ).toBeVisible();

    const ocrSection = page.getByRole("region", { name: "OCR 菜单导入" });
    await ocrSection.locator('input[type="file"]').setInputFiles({
      name: "menu.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await ocrSection.getByRole("button", { name: "上传并识别" }).click();

    const firstDishName = ocrSection.getByPlaceholder("菜名").first();
    await expect(firstDishName).toBeVisible({ timeout: 20_000 });
    await expect(firstDishName).toHaveValue("演示菜品A");

    await ocrSection.getByRole("button", { name: "发布到菜单" }).click();
    await expect(page.getByText("演示菜品A")).toBeVisible({ timeout: 15_000 });

    const menuUrl = page.url();
    const canteenId = menuUrl.split("/").pop()!;
    await page.goto(`/canteen/${canteenId}`);
    await page.getByRole("tab", { name: "午餐" }).click();
    await expect(
      page.getByRole("list").getByText("演示菜品A", { exact: true }),
    ).toBeVisible();
  });
});
