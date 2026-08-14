import { expect, test } from "@playwright/test";

test.describe("#651 mobile WebKit Header", () => {
  test("touch opens the safe-area menu and restores focus after closing", async ({
    page,
  }) => {
    await page.goto("/campus-bus");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );

    const trigger = page.getByRole("button", { name: "打开产品菜单" });
    await trigger.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("button", { name: "关闭产品菜单" }),
    ).toBeFocused();
    expect((await dialog.boundingBox())?.y).toBeGreaterThanOrEqual(0);

    await page.getByRole("button", { name: "关闭产品菜单" }).tap();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.tap();
    await dialog.getByRole("link", { name: "课程测评" }).tap();
    await expect(page).toHaveURL("/courses");
    await expect(dialog).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  });

  test("landscape keeps the Header and product menu inside the visual viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto("/canteen");

    const headerBox = await page.getByTestId("global-header").boundingBox();
    expect(headerBox?.x).toBeGreaterThanOrEqual(0);
    expect((headerBox?.x ?? 0) + (headerBox?.width ?? 0)).toBeLessThanOrEqual(
      667,
    );

    await page.getByRole("button", { name: "打开产品菜单" }).tap();
    const dialogBox = await page.getByRole("dialog").boundingBox();
    expect(dialogBox?.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox?.y).toBeGreaterThanOrEqual(0);
    expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(
      667,
    );
    expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(
      375,
    );
  });
});
