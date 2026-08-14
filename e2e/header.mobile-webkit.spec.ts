import { expect, test } from "@playwright/test";

test.describe("#651 mobile WebKit Header", () => {
  test("touch opens the safe-area menu and restores focus after closing", async ({
    page,
  }) => {
    await page.goto("/campus-bus");

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
});
