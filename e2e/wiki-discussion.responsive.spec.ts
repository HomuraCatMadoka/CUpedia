import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { PAGE_IDS } from "../scripts/seed-data";

test.describe("responsive on-demand discussions", () => {
  test("closed discussions do not reserve editor width and open on demand", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);

    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();
    const closedBox = await editor.boundingBox();
    expect(closedBox).not.toBeNull();
    expect(closedBox!.width).toBeGreaterThan(700);

    const trigger = page.locator(
      'button[aria-controls="wiki-discussion-panel"]',
    );
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName("打开批注");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("complementary", { name: "批注" })).toHaveCount(
      0,
    );

    const undoMarker = `panel-undo-${Date.now()}`;
    await editor.click();
    await page.keyboard.type(` ${undoMarker}`);
    await expect(editor).toContainText(undoMarker);

    await trigger.click();
    const panel = page.getByRole("complementary", { name: "批注" });
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByText("暂无批注")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "关闭批注" }).click();
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Opening and closing the panel must not recreate Plate or clear history.
    await editor.click();
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+z`);
    await expect(editor).not.toContainText(undoMarker);
  });

  test("medium-width discussions overlay without changing the document width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);

    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();
    const before = await editor.boundingBox();
    expect(before).not.toBeNull();

    await page.locator('button[aria-controls="wiki-discussion-panel"]').click();
    await expect(
      page.getByRole("complementary", { name: "批注" }),
    ).toBeVisible();

    const after = await editor.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1);
  });

  test("new pages do not expose comments before they have a page identity", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/wiki/new");
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();
    await expect(
      page.locator('button[aria-controls="wiki-discussion-panel"]'),
    ).toHaveCount(0);
  });
});

test.describe("responsive on-demand discussions on mobile", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    hasTouch: true,
    isMobile: true,
  });

  test("opens the mobile comment composer without squeezing the editor", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);

    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();
    const closedBox = await editor.boundingBox();
    expect(closedBox).not.toBeNull();
    expect(closedBox!.width).toBeGreaterThan(300);

    const desktopTrigger = page.locator(
      'button[aria-controls="wiki-discussion-panel"]',
    );
    await expect(desktopTrigger).toBeHidden();

    await editor.click();
    const toolbar = page.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });
    await toolbar
      .getByRole("button", { name: "添加批注", exact: true })
      .click({ force: true });

    const sheet = page.getByRole("dialog", { name: "添加批注" });
    await expect(sheet).toBeVisible();
    const openBox = await editor.boundingBox();
    expect(openBox).not.toBeNull();
    expect(Math.abs(openBox!.width - closedBox!.width)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(editor).toBeFocused();
  });
});
