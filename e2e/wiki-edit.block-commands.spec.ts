import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

test.describe("wiki editor block commands", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
  });

  test("Slash search supports keyboard selection, Escape, and a clear empty state", async ({
    page,
  }) => {
    await page.goto("/wiki/new");

    const editor = page.locator('[data-slate-editor="true"]');
    const menu = page.getByTestId("slash-command-menu");
    await editor.click();
    await page.keyboard.type("/heading");

    await expect(menu).toBeVisible();
    await expect(menu.getByRole("option", { name: /标题 1/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /正文/ })).toHaveCount(0);
    const menuBox = await menu.boundingBox();
    const firstOptionBox = await menu
      .getByRole("option", { name: /标题 1/ })
      .boundingBox();
    expect(menuBox).not.toBeNull();
    expect(firstOptionBox).not.toBeNull();
    expect(menuBox!.width).toBeGreaterThanOrEqual(318);
    expect(menuBox!.width).toBeLessThanOrEqual(322);
    expect(firstOptionBox!.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(editor.locator("h2")).toBeVisible();
    await expect(editor).toBeFocused();

    await page.keyboard.press("Enter");
    await page.keyboard.type("/does-not-exist");
    await expect(menu).toContainText("未找到匹配的块");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("Slash inserts representative rich content through existing Plate transforms", async ({
    page,
  }) => {
    await page.goto("/wiki/new");

    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page.keyboard.type("/table");
    await expect(page.getByTestId("slash-command-menu")).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(editor.locator("table")).toBeVisible();
  });

  test("the block plus inserts directly after its source block and opens the shared menu", async ({
    page,
  }) => {
    await page.goto("/wiki/edit/getting-started");

    const editor = page.locator('[data-slate-editor="true"]');
    const blocks = editor.getByTestId("wiki-editor-block");
    const sourceBlock = blocks.filter({
      hasText: "New to CUHK? Here are some tips to help you settle in.",
    });
    await expect(sourceBlock).toHaveCount(1);
    const initialCount = await blocks.count();

    await sourceBlock.hover();
    await sourceBlock.getByRole("button", { name: "在此插入内容" }).click();

    await expect(page.getByTestId("slash-command-menu")).toBeVisible();
    await expect(blocks).toHaveCount(initialCount + 1);
    await page
      .getByTestId("slash-command-menu")
      .getByRole("option", { name: /标题 2/ })
      .click();

    const insertedAfterSource = await sourceBlock.evaluate((element) => {
      const next = element.nextElementSibling;
      return {
        isHeading: next?.querySelector("h2") !== null,
      };
    });
    expect(insertedAfterSource).toEqual({ isHeading: true });
    await expect(editor).toBeFocused();
  });

  test("the contextual block menu uses shared labels and only offers valid text conversions", async ({
    page,
  }) => {
    await page.goto("/wiki/new");

    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page.keyboard.type("可转换内容");

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "可转换内容" })
      .first();
    await block.hover();
    await block.getByLabel("打开块菜单").click();
    await page.getByRole("menuitem", { name: "转换为" }).click();

    await expect(page.getByRole("menuitem", { name: "标题 2" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "表格" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "图片" })).toHaveCount(0);

    await page.getByRole("menuitem", { name: "标题 2" }).click();
    await expect(editor.locator("h2")).toContainText("可转换内容");
  });

  test("the grip preserves drag feedback and desktop block reordering", async ({
    page,
  }) => {
    await page.goto("/wiki/edit/getting-started");

    const blocks = page.getByTestId("wiki-editor-block");
    const source = blocks.filter({ hasText: "Registration" }).first();
    const target = blocks.filter({ hasText: "New to CUHK?" }).first();
    await source.hover();

    const grip = source.getByLabel("打开块菜单");
    await expect(grip).toHaveAttribute("draggable", "true");
    await grip.dragTo(target, {
      targetPosition: { x: 24, y: 2 },
    });
    await expect(page.getByRole("menu", { name: "打开块菜单" })).toHaveCount(0);

    const blockTexts = await blocks.allTextContents();
    expect(
      blockTexts.findIndex((text) => text.includes("Registration")),
    ).toBeLessThan(
      blockTexts.findIndex((text) => text.includes("New to CUHK?")),
    );
  });
});
