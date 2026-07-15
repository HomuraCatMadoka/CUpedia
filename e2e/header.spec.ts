import { expect, test } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 393, height: 851 };

test.describe("#315 global Header navigation ownership", () => {
  test.use({ viewport: MOBILE_VIEWPORT, isMobile: true, hasTouch: true });

  test("brand returns home and Header exposes only the agreed product links", async ({
    page,
  }) => {
    await page.goto("/wiki");

    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "CUpedia" })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(header.getByRole("link", { name: "分院帽" })).toHaveAttribute(
      "href",
      "/college-picker",
    );
    await expect(
      header.getByRole("link", { name: "课程测评（测试中）" }),
    ).toHaveAttribute("href", "/courses");
    await expect(header.getByRole("link", { name: "选课技能树" })).toHaveCount(
      0,
    );
  });

  test("Wiki menu trigger is visible on Wiki routes only", async ({ page }) => {
    await page.goto("/wiki");
    await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("button", { name: "打开导航" })).toHaveCount(0);

    await page.goto("/courses");
    await expect(page.getByRole("button", { name: "打开导航" })).toHaveCount(0);
  });

  test("mobile Header actions provide 44px touch targets", async ({ page }) => {
    await page.goto("/wiki");

    const targets = [
      page.getByRole("button", { name: "打开导航" }),
      page.getByRole("button", { name: "搜索 (⌘K)" }),
      page.getByRole("link", { name: "登录" }),
      page.getByRole("link", { name: "分院帽" }),
      page.getByRole("link", { name: "课程测评（测试中）" }),
    ];

    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
