import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

test.describe("mobile WebKit editor interactions", () => {
  test("iPhone taps run insert, turn-into, and mention toolbar actions", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/wiki/new");

    expect(await page.evaluate(() => navigator.userAgent)).toContain("iPhone");

    const editor = page.locator('[data-slate-editor="true"]');
    await editor.tap();
    await page.keyboard.type("WebKit touch draft");

    const toolbar = page.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "插入块", exact: true }).tap();

    const insertSheet = page.getByRole("dialog", { name: "插入块" });
    await expect(insertSheet).toBeVisible();
    await insertSheet.getByRole("button", { name: "标题 2" }).tap();

    await expect(insertSheet).toHaveCount(0);
    const insertedHeading = editor.locator("h2");
    await expect(insertedHeading).toBeVisible();
    await expect(editor).toBeFocused();
    await insertedHeading.tap();
    await page.keyboard.type("Converted heading");
    await expect(insertedHeading).toContainText("Converted heading");

    await toolbar
      .getByRole("button", { name: "转换块类型", exact: true })
      .tap();
    const turnIntoSheet = page.getByRole("dialog", { name: "Turn into" });
    await expect(turnIntoSheet).toBeVisible();
    await turnIntoSheet.getByRole("button", { name: "正文" }).tap();

    await expect(turnIntoSheet).toHaveCount(0);
    await expect(insertedHeading).toHaveCount(0);
    await expect(editor).toContainText("Converted heading");
    await expect(editor).toBeFocused();

    await toolbar.getByRole("button", { name: "提及页面", exact: true }).tap();
    await expect(
      page.getByRole("combobox", { name: "提及 Wiki 页面" }),
    ).toBeFocused();
  });
});
