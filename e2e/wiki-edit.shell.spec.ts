import { Client } from "pg";
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { createUntitledWikiPage, wikiPageUrl } from "./helpers/wiki";
import { PAGE_IDS } from "../scripts/seed-data";

async function dropSettingsFixture() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from wiki_pages where title = any($1::text[])", [
      ["Editor settings fixture", "Page icon fixture"],
    ]);
  } finally {
    await client.end();
  }
}

test.describe("focused wiki editor shell", () => {
  test.setTimeout(180_000);
  test.afterAll(dropSettingsFixture);

  test("canonical pages use one focused shell and legacy new no longer edits", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);

    await page.goto(`/wiki/${PAGE_IDS.welcome}`);
    await expect(
      page.getByRole("banner", { name: "编辑器顶栏" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "分院帽" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "完成", exact: true }),
    ).toBeHidden();

    await page.goto("/wiki/new");
    await expect(page).toHaveURL(/\/wiki$/);
    await expect(page.getByRole("link", { name: "分院帽" })).toBeVisible();
    await expect(page.getByRole("banner", { name: "编辑器顶栏" })).toHaveCount(
      0,
    );
  });

  test("desktop mirrors the Notion sidebar and wide document geometry", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const pageTree = page.getByRole("navigation", { name: "Wiki 页面树" });
    const pageTreeBox = await pageTree.boundingBox();
    expect(pageTreeBox).not.toBeNull();
    expect(pageTreeBox!.width).toBeGreaterThanOrEqual(256);
    expect(pageTreeBox!.width).toBeLessThanOrEqual(264);

    const topbar = page.getByRole("banner", { name: "编辑器顶栏" });
    const topbarBox = await topbar.boundingBox();
    expect(topbarBox).not.toBeNull();
    expect(topbarBox!.height).toBeGreaterThanOrEqual(44);
    expect(topbarBox!.height).toBeLessThanOrEqual(46);
    expect(topbarBox!.x).toBe(pageTreeBox!.width);
    const topbarBorder = await topbar.evaluate(
      (element) => getComputedStyle(element).borderBottomWidth,
    );
    expect(topbarBorder).toBe("1px");

    const document = page.getByTestId("wiki-editor-document");
    await expect(document).toBeVisible();
    const documentBox = await document.boundingBox();
    expect(documentBox).not.toBeNull();
    expect(documentBox!.x).toBe(pageTreeBox!.width);
    expect(documentBox!.width).toBe(1440 - pageTreeBox!.width);

    const firstBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    const firstBlockBox = await firstBlock.boundingBox();
    expect(firstBlockBox).not.toBeNull();
    const leftGutter = firstBlockBox!.x - documentBox!.x;
    const rightGutter =
      documentBox!.x +
      documentBox!.width -
      (firstBlockBox!.x + firstBlockBox!.width);
    expect(leftGutter).toBeGreaterThanOrEqual(94);
    expect(leftGutter).toBeLessThanOrEqual(98);
    expect(rightGutter).toBeGreaterThanOrEqual(94);
    expect(rightGutter).toBeLessThanOrEqual(98);

    const title = page.getByRole("textbox", { name: "页面标题" });
    await expect(title).toBeVisible();
    const titleStyle = await title.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderTopWidth: style.borderTopWidth,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    });
    expect(titleStyle.borderTopWidth).toBe("0px");
    expect(Number.parseFloat(titleStyle.fontSize)).toBeGreaterThanOrEqual(38);
    expect(Number.parseInt(titleStyle.fontWeight, 10)).toBeGreaterThanOrEqual(
      700,
    );

    const canvas = page.getByTestId("wiki-editor-canvas");
    const canvasBorder = await canvas.evaluate(
      (element) => getComputedStyle(element).borderTopWidth,
    );
    expect(canvasBorder).toBe("0px");
    await expect(
      page
        .locator('[data-slate-editor="true"]')
        .getByRole("textbox", { name: "页面标题" }),
    ).toHaveCount(0);
  });

  test("a legacy body heading matching the page title is not duplicated", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      "Getting Started",
    );
    const editor = page.locator('[data-slate-editor="true"]');
    await expect(
      editor.getByRole("heading", {
        name: "Getting Started",
        level: 1,
      }),
    ).toHaveCount(0);
    await expect(editor).toContainText(
      "New to CUHK? Here are some tips to help you settle in.",
    );
  });

  test("desktop document uses the mockup title and body rhythm", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const rhythm = await page.evaluate(() => {
      const title = document.querySelector("#title");
      const canvas = document.querySelector(
        '[data-testid="wiki-editor-canvas"]',
      );
      if (!(title instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
        throw new Error("Editor title or canvas was not found");
      }
      const titleRect = title.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        gap: canvasRect.top - titleRect.bottom,
        fontFamily: getComputedStyle(title).fontFamily,
      };
    });
    expect(rhythm.gap).toBeGreaterThanOrEqual(28);
    expect(rhythm.gap).toBeLessThanOrEqual(32);
    expect(rhythm.fontFamily).not.toMatch(/Times/i);

    await expect(page.locator('[data-slate-editor="true"]')).toHaveCSS(
      "line-height",
      "24px",
    );
  });

  test("desktop editor topbar keeps discussion as a compact action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const comments = page.getByRole("button", { name: "打开批注" });
    const commentsBox = await comments.boundingBox();
    expect(commentsBox).not.toBeNull();
    expect(commentsBox!.width).toBeLessThanOrEqual(40);
    await expect(comments).toHaveText("");
  });

  test("editor topbar shows the real parent path", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.dining}`);

    const topbar = page.getByRole("banner", { name: "编辑器顶栏" });
    await expect(
      topbar.getByRole("link", { name: "Campus Life", exact: true }),
    ).toHaveAttribute("href", `/wiki/${PAGE_IDS.campusLife}`);
    await expect(
      topbar.getByText("Dining on Campus", { exact: true }),
    ).toBeVisible();
  });

  test("desktop page tree and editor occupy one stable full-height workspace", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);

    const pageTree = page.getByRole("navigation", { name: "Wiki 页面树" });
    const topbar = page.getByRole("banner", { name: "编辑器顶栏" });
    await expect(pageTree).toBeVisible();
    await expect(topbar).toBeVisible();

    const pageTreeBox = await pageTree.boundingBox();
    const topbarBox = await topbar.boundingBox();
    expect(pageTreeBox).not.toBeNull();
    expect(topbarBox).not.toBeNull();
    expect(pageTreeBox!.y).toBe(0);
    expect(pageTreeBox!.height).toBe(900);
    expect(topbarBox!.x).toBe(pageTreeBox!.width);
  });

  test("focused sidebar exposes real workspace navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const pageTree = page.getByRole("navigation", { name: "Wiki 页面树" });
    await expect(
      pageTree.getByRole("link", { name: "CUpedia", exact: true }),
    ).toHaveAttribute("href", "/wiki");
    await expect(
      pageTree.getByRole("link", { name: "搜索", exact: true }),
    ).toHaveAttribute("href", "/wiki/search");
    await expect(
      pageTree.getByRole("link", { name: "首页", exact: true }),
    ).toHaveAttribute("href", "/wiki");
    await expect(pageTree.getByText("Wiki", { exact: true })).toBeVisible();
  });

  test("focused page tree presents the edited page as an active leaf", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const pageTree = page.getByRole("navigation", { name: "Wiki 页面树" });
    const currentPage = pageTree.getByRole("link", {
      name: "Getting Started",
      exact: true,
    });
    await expect(currentPage).toHaveAttribute("aria-current", "page");

    const style = await currentPage.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        textTransform: computed.textTransform,
      };
    });
    expect(style.textTransform).toBe("none");

    const currentItem = pageTree.getByRole("treeitem", {
      name: "Getting Started",
    });
    await expect(currentItem.locator(":scope > .wiki-tree-row")).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(currentItem.getByRole("button", { name: "折叠" })).toHaveCount(
      0,
    );
  });

  test("desktop discussion panel docks at 320px beside the wide document", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);
    await page.getByRole("button", { name: "打开批注" }).click();

    const panel = page.getByRole("complementary", { name: "批注" });
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.x + panelBox!.width).toBe(1440);
    expect(panelBox!.y).toBe(44);
    expect(panelBox!.width).toBe(320);
    expect(panelBox!.height).toBe(856);

    const documentBox = await page
      .getByTestId("wiki-editor-document")
      .boundingBox();
    const pageTreeBox = await page
      .getByRole("navigation", { name: "Wiki 页面树" })
      .boundingBox();
    expect(documentBox).not.toBeNull();
    expect(pageTreeBox).not.toBeNull();
    expect(documentBox!.width).toBe(
      1440 - pageTreeBox!.width - panelBox!.width,
    );
  });

  test("page settings keep parent and edit summary discoverable without a mutable URL", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);

    await page.getByRole("button", { name: "页面设置" }).click();
    const settings = page.getByRole("dialog", { name: "页面设置" });
    await expect(settings).toBeVisible();
    await expect(
      settings.getByRole("textbox", { name: "URL 路径" }),
    ).toHaveCount(0);
    await expect(
      settings.getByRole("combobox", { name: "父页面" }),
    ).toBeVisible();
    await expect(
      settings.getByRole("textbox", { name: "编辑摘要（可选）" }),
    ).toBeVisible();
  });

  test("parent picker excludes the current page and all descendants", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.campusLife}`);
    await page.getByRole("button", { name: "页面设置" }).click();

    const parentPicker = page
      .getByRole("dialog", { name: "页面设置" })
      .getByRole("combobox", { name: "父页面" });
    await expect(
      parentPicker.getByRole("option", { name: "Campus Life" }),
    ).toHaveCount(0);
    await expect(
      parentPicker.getByRole("option", { name: "Dining on Campus" }),
    ).toHaveCount(0);
    await expect(
      parentPicker.getByRole("option", { name: "United College Canteen" }),
    ).toHaveCount(0);
    await expect(
      parentPicker.getByRole("option", { name: "Getting Started" }),
    ).toBeAttached();
  });

  test("393px editor has one compact topbar and 24px document gutters", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);

    const topbar = page.getByRole("banner", { name: "编辑器顶栏" });
    await expect(topbar).toHaveCount(1);
    const topbarBox = await topbar.boundingBox();
    expect(topbarBox).not.toBeNull();
    expect(topbarBox!.y).toBe(0);
    expect(topbarBox!.height).toBe(44);

    await expect(topbar.getByRole("button", { name: "打开批注" })).toHaveCount(
      0,
    );
    await page.locator('[data-slate-editor="true"]').click();
    const comments = page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "添加批注" });
    const commentsBox = await comments.boundingBox();
    expect(commentsBox).not.toBeNull();
    expect(commentsBox!.width).toBe(44);

    const title = page.getByRole("textbox", { name: "页面标题" });
    const titleBox = await title.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(titleBox!.x).toBe(24);
    expect(titleBox!.width).toBe(345);
    await expect(title).toHaveCSS("font-size", "32px");

    await expect(page.locator('[data-slate-editor="true"]')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === window.innerWidth,
      ),
    ).toBe(true);
  });

  test("mobile drawer reuses the focused workspace navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);
    await page.getByRole("button", { name: "打开导航" }).click();

    const pageTree = page.getByRole("navigation", { name: "Wiki 页面树" });
    await expect(pageTree).toBeVisible();
    await expect(
      pageTree.getByRole("link", { name: "CUpedia", exact: true }),
    ).toHaveAttribute("href", "/wiki");
    await expect(
      pageTree.getByRole("link", { name: "搜索", exact: true }),
    ).toHaveAttribute("href", "/wiki/search");
    await expect(
      pageTree.getByRole("link", { name: "首页", exact: true }),
    ).toHaveAttribute("href", "/wiki");
    await expect(
      pageTree.getByRole("link", {
        name: "Getting Started",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("responsive switching keeps one Plate instance, draft, and undo history", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await createUntitledWikiPage(page);

    await page
      .getByRole("textbox", { name: "页面标题" })
      .fill("Responsive draft");
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.fill("alpha");
    await editor.press("End");
    await page.keyboard.type(" beta");
    await expect(editor).toContainText("alpha beta");

    await page.setViewportSize({ width: 393, height: 852 });
    await expect(page.locator('[data-slate-editor="true"]')).toHaveCount(1);
    await expect(editor).toContainText("alpha beta");
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      "Responsive draft",
    );

    await editor.click();
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+z`);
    await expect(editor).not.toContainText("beta");
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      "Responsive draft",
    );
  });

  test("settings-only edits persist through explicit autosave", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);
    await page.getByRole("button", { name: "页面设置" }).click();
    await page
      .getByRole("dialog", { name: "页面设置" })
      .getByRole("textbox", { name: "编辑摘要（可选）" })
      .fill("Unsaved settings summary");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+s");
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
    );

    await page.goto(`/wiki/history/${PAGE_IDS.welcome}`);
    await expect(
      page.getByText("Unsaved settings summary", { exact: false }),
    ).toBeVisible();
  });

  test("parent and edit summary persist when they are the only changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);

    await createUntitledWikiPage(page);
    await page
      .getByRole("textbox", { name: "页面标题" })
      .fill("Editor settings fixture");
    await page.locator('[data-slate-editor="true"]').fill("Settings body");
    await page.keyboard.press("Control+s");
    const settingsPageId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.getByRole("button", { name: "页面设置" }).click();
    const settings = page.getByRole("dialog", { name: "页面设置" });
    await settings
      .getByRole("combobox", { name: "父页面" })
      .selectOption({ label: "Campus Life" });
    await settings
      .getByRole("textbox", { name: "编辑摘要（可选）" })
      .fill("Move from page settings");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+s");
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
    );

    await expect(page).toHaveURL(wikiPageUrl(settingsPageId));
    await expect(page.getByLabel("页面标题")).toHaveValue(
      "Editor settings fixture",
    );

    await page.goto(`/wiki/history/${settingsPageId}`);
    await expect(page.getByText("Move from page settings")).toBeVisible();
  });

  test("page Emoji persists through create, read, sidebar, edit, and removal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await createUntitledWikiPage(page);

    await page
      .getByRole("textbox", { name: "页面标题" })
      .fill("Page icon fixture");
    await page.getByRole("button", { name: "添加页面图标" }).click();
    const picker = page.getByRole("dialog", { name: "选择页面图标" });
    await picker.getByRole("textbox", { name: "搜索 Emoji" }).fill("学习");
    await picker.getByRole("button", { name: "学习", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "更改页面图标，当前为 📚" }),
    ).toBeVisible();

    await page.locator('[data-slate-editor="true"]').fill("Icon body");
    await page.keyboard.press("Control+s");
    const iconPageId = new URL(page.url()).pathname.split("/").at(-1)!;

    const treeItem = page
      .getByRole("tree", { name: "Wiki 页面层级" })
      .getByRole("treeitem", { name: "Page icon fixture" });
    await expect(treeItem.getByTestId("wiki-page-icon")).toHaveText("📚");

    await expect(
      page.getByRole("button", { name: "更改页面图标，当前为 📚" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "更改页面图标，当前为 📚" }).click();
    await page
      .getByRole("dialog", { name: "选择页面图标" })
      .getByRole("button", { name: "移除" })
      .click();
    await page.keyboard.press("Control+s");
    await expect(page).toHaveURL(wikiPageUrl(iconPageId));
    await expect(page.getByTestId("wiki-page-hero-icon")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "添加页面图标" }),
    ).toBeVisible();
  });

  test("desktop Emoji picker exposes the full catalog in a dense keyboard-navigable grid", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await createUntitledWikiPage(page);

    await page.getByRole("button", { name: "添加页面图标" }).click();
    const picker = page.getByRole("dialog", { name: "选择页面图标" });
    const choices = picker.locator(".epr-emoji");
    const search = picker.getByRole("textbox", { name: "搜索 Emoji" });
    await expect(choices.first()).toBeVisible();

    expect(
      await choices.evaluateAll((buttons) => {
        const visibleButtons = buttons.filter((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        });
        const firstRowY = visibleButtons[0]?.getBoundingClientRect().y;
        return visibleButtons.filter(
          (button) =>
            Math.abs(button.getBoundingClientRect().y - firstRowY) < 1,
        ).length;
      }),
    ).toBe(12);
    expect(await choices.count()).toBeGreaterThan(50);

    await search.fill("独角兽");
    await expect(
      picker.getByRole("button", { name: "独角兽", exact: true }),
    ).toBeVisible();
    await expect(picker.locator("#epr-search-id")).toHaveText(
      "找到 1 个结果。使用上下方向键浏览。",
    );
    await search.fill("");

    const firstChoice = picker.locator('.epr-emoji[data-unified="1f600"]');
    const rightChoice = picker.locator('.epr-emoji[data-unified="1f603"]');
    const downChoice = picker.locator('.epr-emoji[data-unified="1f607"]');
    await expect(firstChoice).toBeVisible();
    await expect(firstChoice.locator(".epr-emoji-native")).not.toHaveCSS(
      "font-family",
      /Geist/,
    );
    await firstChoice.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rightChoice).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(downChoice).toBeFocused();
  });

  test("Emoji picker stays usable within a 393px mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await loginAsAdmin(page);
    await createUntitledWikiPage(page);

    const addIcon = page.getByRole("button", { name: "添加页面图标" });
    expect((await addIcon.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await addIcon.click();
    const picker = page.getByRole("dialog", { name: "选择页面图标" });
    await expect(picker).toBeVisible();
    const bounds = await picker.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(393);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(852);
    expect(
      (await picker.locator(".epr-emoji").first().boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);

    const tones = picker.locator(".epr-tone");
    await expect(tones).toHaveCount(6);
    await expect(
      picker.getByRole("button", { name: "肤色：默认" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      await tones.evaluateAll(
        (buttons) =>
          buttons.filter(
            (button) => (button as HTMLButtonElement).tabIndex >= 0,
          ).length,
      ),
    ).toBe(1);

    const defaultTone = picker.getByRole("button", { name: "肤色：默认" });
    const search = picker.getByRole("textbox", {
      name: "搜索 Emoji",
      includeHidden: true,
    });
    const defaultToneBounds = await defaultTone.boundingBox();
    expect(defaultToneBounds?.width).toBeGreaterThanOrEqual(44);
    expect(defaultToneBounds?.height).toBeGreaterThanOrEqual(44);
    await defaultTone.click();
    await expect(search).toBeHidden();
    await expect(
      picker.getByRole("button", { name: "肤色：默认" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      await tones.evaluateAll(
        (buttons) =>
          buttons.filter(
            (button) => (button as HTMLButtonElement).tabIndex >= 0,
          ).length,
      ),
    ).toBe(6);
    for (const tone of await tones.all()) {
      const toneBounds = await tone.boundingBox();
      expect(toneBounds?.width).toBeGreaterThanOrEqual(44);
      expect(toneBounds?.height).toBeGreaterThanOrEqual(44);
    }
    await picker.getByRole("button", { name: "肤色：中等" }).click();
    await expect(search).toBeVisible();

    await search.fill("挥手");
    await picker.locator('.epr-emoji[data-unified="1f44b-1f3fd"]').click();
    await expect(
      page.getByRole("button", { name: "更改页面图标，当前为 👋🏽" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "更改页面图标，当前为 👋🏽" }).click();
    const removeIcon = page
      .getByRole("dialog", { name: "选择页面图标" })
      .getByRole("button", { name: "移除" });
    await expect
      .poll(async () => (await removeIcon.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    await removeIcon.click();
    await expect(addIcon).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === window.innerWidth,
      ),
    ).toBe(true);
  });
});
