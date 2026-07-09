import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (res.ok()) return;
    last = `${res.status()} ${await res.text()}`;
    if (res.status() !== 429) break;
    await page.waitForTimeout(2000);
  }
  expect(false, `login failed: ${last}`).toBe(true);
}

test.describe("canteen menu OCR import", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("admin uploads menu image, proofreads, and publishes dishes", async ({
    page,
  }) => {
    const canteenName = `E2E导入食堂-${Date.now()}`;

    await page.goto("/admin/canteens", { waitUntil: "networkidle" });
    await page.getByLabel("食堂名称").fill(canteenName);
    await page.getByRole("button", { name: "添加食堂" }).click();
    await expect(page.getByText(canteenName)).toBeVisible();

    await page
      .locator("div")
      .filter({ hasText: canteenName })
      .getByRole("link", { name: "管理菜单" })
      .click();
    await expect(page.getByRole("heading", { name: /菜单/ })).toBeVisible();

    const ocrSection = page.getByRole("region", { name: "OCR 菜单导入" });
    await ocrSection
      .locator('input[type="file"]')
      .setInputFiles({
        name: "menu.png",
        mimeType: "image/png",
        buffer: TINY_PNG,
      });
    await ocrSection.getByRole("button", { name: "上传并识别" }).click();

    await expect(ocrSection.getByPlaceholder("菜名").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(ocrSection.getByDisplayValue("演示菜品A")).toBeVisible();

    await ocrSection.getByRole("button", { name: "发布到菜单" }).click();
    await expect(page.getByText("演示菜品A")).toBeVisible({ timeout: 15_000 });

    const menuUrl = page.url();
    const canteenId = menuUrl.split("/").pop()!;
    await page.goto(`/canteen/${canteenId}`, { waitUntil: "networkidle" });
    await expect(page.getByText("演示菜品A")).toBeVisible();
  });
});
