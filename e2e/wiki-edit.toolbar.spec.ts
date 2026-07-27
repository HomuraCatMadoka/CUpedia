import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createUntitledWikiPage } from "./helpers/wiki";
import { PAGE_IDS } from "../scripts/seed-data";
import { Client } from "pg";

/**
 * Contextual desktop editing.
 *
 * ref #203 keeps the hydration and valid-button regressions covered while
 * replacing the old always-on toolbar contract with the Notion-style quiet
 * default required by Ticket 06.
 */

const RICH_SLUG = "rich-content-demo";
let gettingStartedBaseline = "";

async function readWikiContent(slug: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ content: string }>(
      "select content from wiki_pages where slug = $1",
      [slug],
    );
    return result.rows[0]?.content ?? "";
  } finally {
    await client.end();
  }
}

async function restoreWikiContent(slug: string, content: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("update wiki_pages set content = $1 where slug = $2", [
      content,
      slug,
    ]);
  } finally {
    await client.end();
  }
}

// e2e runs a production build, where a React hydration failure surfaces as a
// *minified* page error ("Minified React error #418; visit …/418") — the
// plain-text "hydration"/"did not match" wording only exists in dev. Match both
// so the guard actually bites in CI.
const HYDRATION_RE =
  /hydration|did not match|server rendered html|Text content does not match|react\.dev\/errors\/(418|421|423|425)|Minified React error #(418|421|423|425)/i;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function selectText(page: Page, text: string) {
  const hydratedEditor = page.locator(
    '[data-testid="wiki-editor-shell"][data-editor-hydrated="true"]',
  );
  await expect(hydratedEditor).toHaveCount(1);
  const editor = hydratedEditor.locator('[data-slate-editor="true"]');

  await expect(editor).toHaveCount(1);
  await expect(editor).toBeEditable();
  const points = await editor.evaluate((element, needle) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node && !node.textContent?.includes(needle)) {
      node = walker.nextNode();
    }
    if (!node?.textContent) throw new Error(`Text not found: ${needle}`);

    const start = node.textContent.indexOf(needle);
    const startRange = document.createRange();
    startRange.setStart(node, start);
    startRange.setEnd(node, start + 1);
    const startRect = startRange.getBoundingClientRect();
    const endRange = document.createRange();
    endRange.setStart(node, start + needle.length - 1);
    endRange.setEnd(node, start + needle.length);
    const endRect = endRange.getBoundingClientRect();

    return {
      start: { x: startRect.left + 1, y: startRect.top + startRect.height / 2 },
      end: { x: endRect.right - 1, y: endRect.top + endRect.height / 2 },
    };
  }, text);

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.mouse.move(points.start.x, points.start.y);
    await page.mouse.down();
    await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
    await page.mouse.up();
    if (
      (await page.evaluate(() => window.getSelection()?.toString() ?? "")) ===
      text
    ) {
      break;
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }

  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe(text);
}

test.describe("#203 contextual desktop toolbar", () => {
  test.beforeAll(async () => {
    gettingStartedBaseline = await readWikiContent("getting-started");
  });

  test.beforeEach(async ({ page }) => {
    await restoreWikiContent("getting-started", gettingStartedBaseline);
    await loginAsAdmin(page);
  });

  test.afterEach(async ({ page }) => {
    if (!page.isClosed()) await page.close();
    await restoreWikiContent("getting-started", gettingStartedBaseline);
  });

  test("the document opens in a quiet default state without a format toolbar", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${RICH_SLUG}`);

    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    await expect(page.getByTestId("fixed-toolbar-buttons")).toHaveCount(0);
    await expect(
      page.getByRole("toolbar", { name: "文字格式工具栏" }),
    ).toHaveCount(0);
  });

  test("selecting text opens the contextual format toolbar and collapsing the selection closes it", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    await selectText(page, "New to CUHK?");

    const toolbar = page.getByRole("toolbar", {
      name: "文字格式工具栏",
    });
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByLabel("粗体")).toBeVisible();
    await expect(toolbar.getByLabel("链接")).toBeVisible();
    await expect(toolbar.getByLabel("批注")).toBeVisible();
    expect(await page.locator("button button").count()).toBe(0);
    await expect(
      toolbar.locator('[aria-haspopup="menu"]').first(),
    ).toBeVisible();

    await page.getByLabel("页面标题").click();
    await expect(toolbar).toHaveCount(0);
  });

  test("Escape selects the current block with a full-row Notion-style highlight", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await selectText(page, "New to CUHK?");
    await expect(
      page.getByRole("toolbar", { name: "文字格式工具栏" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(block).toHaveAttribute("data-block-selected", "true");
    const selection = block.getByTestId("wiki-block-selection");
    await expect(selection).toBeVisible();

    const blockBox = await block.boundingBox();
    const selectionBox = await selection.boundingBox();
    expect(blockBox).not.toBeNull();
    expect(selectionBox).not.toBeNull();
    expect(blockBox!.x - selectionBox!.x).toBeGreaterThanOrEqual(5);
    expect(blockBox!.x - selectionBox!.x).toBeLessThanOrEqual(7);
    expect(selectionBox!.width - blockBox!.width).toBeGreaterThanOrEqual(11);
    expect(selectionBox!.width - blockBox!.width).toBeLessThanOrEqual(13);
    expect(blockBox!.y - selectionBox!.y).toBeGreaterThanOrEqual(1);
    expect(blockBox!.y - selectionBox!.y).toBeLessThanOrEqual(3);
    expect(selectionBox!.height - blockBox!.height).toBeGreaterThanOrEqual(3);
    expect(selectionBox!.height - blockBox!.height).toBeLessThanOrEqual(5);
    await expect(selection).toHaveCSS("background-color", "rgb(228, 237, 250)");

    await page.keyboard.press("Escape");
    await expect(selection).toHaveCount(0);
  });

  test("arrow keys move a block selection and Shift extends it", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const blocks = page.getByTestId("wiki-editor-block");
    const editor = page.locator('[data-slate-editor="true"]');
    await expect(editor).toBeEditable();
    await expect.poll(() => blocks.count()).toBeGreaterThanOrEqual(3);
    const firstBlock = blocks.nth(0);
    const nextBlock = blocks.nth(1);
    const followingBlock = blocks.nth(2);

    const firstBlockText = (
      await firstBlock.locator('[data-slate-node="text"]').first().textContent()
    )?.trim();
    expect(firstBlockText).toBeTruthy();
    await selectText(page, firstBlockText!);
    await page.keyboard.press("Escape");
    await expect(firstBlock).toHaveAttribute("data-block-selected", "true");
    await expect(page.locator(".slate-shadow-input")).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(firstBlock).not.toHaveAttribute("data-block-selected", "true");
    await expect(nextBlock).toHaveAttribute("data-block-selected", "true");

    await page.keyboard.press("Shift+ArrowDown");
    await expect(nextBlock).toHaveAttribute("data-block-selected", "true");
    await expect(followingBlock).toHaveAttribute("data-block-selected", "true");
  });

  test("Enter returns a selected text block to inline editing", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await selectText(page, "New to CUHK?");
    await page.keyboard.press("Escape");
    await expect(block).toHaveAttribute("data-block-selected", "true");

    await page.keyboard.press("Enter");

    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    await expect(page.locator('[data-slate-editor="true"]')).toBeFocused();
  });

  test("Command+D duplicates a selected block and selects the copy", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const matchingBlocks = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" });
    await selectText(page, "New to CUHK?");
    await page.keyboard.press("Escape");
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+d`);

    await expect(matchingBlocks).toHaveCount(2);
    await expect(matchingBlocks.nth(1)).toHaveAttribute(
      "data-block-selected",
      "true",
    );
  });

  test("Delete removes the selected block without requiring its menu", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await selectText(page, "New to CUHK?");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Delete");

    await expect(block).toHaveCount(0);
  });

  test("a fine-pointer hover reveals contextual block controls without shifting the document", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const document = page.getByTestId("wiki-editor-document");
    const before = await document.boundingBox();
    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    const gutter = block.getByTestId("wiki-block-gutter");

    await expect(gutter).toHaveCSS("opacity", "0");
    await block.hover();
    await expect(gutter).toHaveCSS("opacity", "1");
    const insertButton = block.getByLabel("在此插入内容");
    const gripButton = block.getByLabel("打开块菜单");
    await expect(insertButton).toBeVisible();
    await expect(gripButton).toBeVisible();

    const blockBox = await block.boundingBox();
    const insertBox = await insertButton.boundingBox();
    const gripBox = await gripButton.boundingBox();
    expect(blockBox).not.toBeNull();
    expect(insertBox).not.toBeNull();
    expect(gripBox).not.toBeNull();
    const insertCenter = insertBox!.x + insertBox!.width / 2;
    const gripCenter = gripBox!.x + gripBox!.width / 2;
    const blockCenterY = blockBox!.y + blockBox!.height / 2;
    const insertCenterY = insertBox!.y + insertBox!.height / 2;
    const gripCenterY = gripBox!.y + gripBox!.height / 2;
    expect(blockBox!.x - insertCenter).toBeGreaterThanOrEqual(48);
    expect(blockBox!.x - insertCenter).toBeLessThanOrEqual(52);
    expect(blockBox!.x - gripCenter).toBeGreaterThanOrEqual(26);
    expect(blockBox!.x - gripCenter).toBeLessThanOrEqual(30);
    expect(gripCenter - insertCenter).toBeGreaterThanOrEqual(20);
    expect(gripCenter - insertCenter).toBeLessThanOrEqual(24);
    expect(Math.abs(insertCenterY - blockCenterY)).toBeLessThanOrEqual(1);
    expect(Math.abs(gripCenterY - blockCenterY)).toBeLessThanOrEqual(1);

    const after = await document.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.x).toBe(before!.x);
    expect(after!.width).toBe(before!.width);
  });

  test("a wide coarse-pointer viewport does not expose hover-only block controls", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      hasTouch: true,
      isMobile: true,
      viewport: { width: 1440, height: 900 },
    });
    const touchPage = await context.newPage();

    try {
      await loginAsAdmin(touchPage, baseURL ?? "");
      await touchPage.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

      const block = touchPage
        .getByTestId("wiki-editor-block")
        .filter({ hasText: "New to CUHK?" })
        .first();
      await block.tap();

      const gutter = block.getByTestId("wiki-block-gutter");
      await expect(gutter).toHaveCSS("opacity", "0");
      await expect(gutter).toHaveCSS("pointer-events", "none");
    } finally {
      await context.close();
    }
  });

  test("the grip opens an accessible block menu and Escape returns focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await block.hover();
    const trigger = block.getByLabel("打开块菜单");
    await trigger.click();

    const menu = page.getByRole("menu", { name: "打开块菜单" });
    await expect(menu).toBeVisible();
    await expect(block).toHaveAttribute("data-block-selected", "true");
    await expect(menu.getByRole("menuitem", { name: "转换为" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "复制" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "上移" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "下移" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "删除" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("Command+/ opens the action menu for the selected block", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    await selectText(page, "New to CUHK?");
    await page.keyboard.press("Escape");
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+/`);

    const menu = page.getByRole("menu", { name: "打开块菜单" });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("searchbox", { name: "搜索块操作" }),
    ).toBeFocused();
  });

  test("the block menu searches actions while preserving its keyboard close cycle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await block.hover();
    const trigger = block.getByLabel("打开块菜单");
    await trigger.click();

    const menu = page.getByRole("menu", { name: "打开块菜单" });
    const search = menu.getByRole("searchbox", { name: "搜索块操作" });
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
    await expect(menu).toContainText("正文");

    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.width).toBeGreaterThanOrEqual(260);
    expect(menuBox!.width).toBeLessThanOrEqual(268);

    await search.fill("删除");
    await expect(menu.getByRole("menuitem", { name: "删除" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "复制" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "转换为" })).toHaveCount(0);

    await search.fill("标题");
    await expect(menu.getByRole("menuitem", { name: "转换为" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "删除" })).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("the block menu can start a comment for the whole block", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await block.hover();
    await block.getByLabel("打开块菜单").click();
    const menu = page.getByRole("menu", { name: "打开块菜单" });
    await menu.getByRole("menuitem", { name: "批注" }).click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);

    await expect(menu).toHaveCount(0);
    const draftComment = block.locator('[data-comment-id="draft"]');
    await expect(draftComment).toContainText(
      "New to CUHK? Here are some tips to help you settle in.",
    );
    await expect(draftComment.locator("..")).toHaveCSS(
      "border-bottom-width",
      "0px",
    );
    await expect(page.getByText("新建批注", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("输入批注内容…")).toBeFocused();
  });

  test("the block menu converts the targeted block through the shared command catalog", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await block.hover();
    await block.getByLabel("打开块菜单").click();
    await page.getByRole("menuitem", { name: "转换为" }).click();
    await expect(
      page.getByRole("menuitemradio", { name: "正文" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemradio", { name: "标题 2" }).click();

    await expect(block.getByRole("heading", { level: 2 })).toContainText(
      "New to CUHK?",
    );
  });

  test("code conversion uses the block menu target instead of the caret block", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const caretBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    const targetBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "Registration" })
      .first();
    await caretBlock.click();
    await page.keyboard.press("End");

    await targetBlock.hover();
    await targetBlock.getByLabel("打开块菜单").click();
    await page.getByRole("menuitem", { name: "转换为" }).click();
    await page.getByRole("menuitemradio", { name: "代码块" }).click();

    await expect(targetBlock.locator("pre")).toContainText("Registration");
    await expect(caretBlock.locator("pre")).toHaveCount(0);
  });

  test("the block menu duplicates the targeted block and selects the copy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const matchingBlocks = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" });
    const source = matchingBlocks.first();
    await source.hover();
    await source.getByLabel("打开块菜单").click();
    await page.getByRole("menuitem", { name: "复制" }).click();

    await expect(matchingBlocks).toHaveCount(2);
    await expect(matchingBlocks.nth(1)).toHaveAttribute(
      "data-block-selected",
      "true",
    );
  });

  test("the block menu moves a block relative to its siblings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const headingBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "Registration" })
      .first();
    const registryBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "Registry" })
      .first();
    const beforeHeading = await headingBlock.boundingBox();
    const beforeRegistry = await registryBlock.boundingBox();
    expect(beforeHeading!.y).toBeLessThan(beforeRegistry!.y);

    await headingBlock.hover();
    await headingBlock.getByLabel("打开块菜单").click();
    await page.getByRole("menuitem", { name: "下移" }).click();

    const blockTexts = await page
      .getByTestId("wiki-editor-block")
      .allTextContents();
    const headingIndex = blockTexts.findIndex((text) =>
      text.includes("Registration"),
    );
    const registryIndex = blockTexts.findIndex((text) =>
      text.includes("Registry"),
    );
    expect(headingIndex).toBeGreaterThan(registryIndex);
    await expect(page.getByRole("menu", { name: "打开块菜单" })).toHaveCount(0);
  });

  test("deleting a block offers an undo action that restores it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/wiki/edit/${PAGE_IDS.gettingStarted}`);

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "Registration" })
      .first();
    await block.hover();
    await block.getByLabel("打开块菜单").click();
    await page.getByRole("menuitem", { name: "删除" }).click();

    await expect(
      page.getByRole("heading", { name: "Registration", level: 2 }),
    ).toHaveCount(0);
    await expect(page.getByText("已删除块", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "撤销" }).click();
    await expect(
      page.getByRole("heading", { name: "Registration", level: 2 }),
    ).toBeVisible();
  });

  test("keyboard users enter block controls only after selecting a block", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await createUntitledWikiPage(page);
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page.keyboard.type("New to CUHK?");

    const block = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    const addButton = block.getByLabel("在此插入内容");
    const menuButton = block.getByLabel("打开块菜单");
    await expect(addButton).toHaveAttribute("tabindex", "-1");
    await expect(menuButton).toHaveAttribute("tabindex", "-1");

    await block.click();
    await page.keyboard.press("Escape");
    await expect(addButton).toHaveAttribute("tabindex", "0");
    await expect(menuButton).toHaveAttribute("tabindex", "0");

    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => ({
        blockText:
          document.activeElement
            ?.closest('[data-testid="wiki-editor-block"]')
            ?.textContent?.trim() ?? "",
        label: document.activeElement?.getAttribute("aria-label"),
      })),
    ).toEqual({
      blockText: expect.stringContaining("New to CUHK?"),
      label: "在此插入内容",
    });
    await page.keyboard.press("Tab");
    await expect(menuButton).toBeFocused();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "打开块菜单" });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(menuButton).toBeFocused();
  });

  test("the create page hydrates with no auth-state mismatch (ref #202)", async ({
    page,
  }) => {
    // Guard the Navbar SSR-hydration fix on the create editor.
    const consoleErrors = collectConsoleErrors(page);

    await createUntitledWikiPage(page);
    await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();
    await expect(page.getByTestId("fixed-toolbar-buttons")).toHaveCount(0);
    const hydrationErrors = consoleErrors.filter((e) => HYDRATION_RE.test(e));
    expect(
      hydrationErrors,
      `hydration errors on /wiki/new:\n${hydrationErrors.join("\n")}`,
    ).toHaveLength(0);
  });
});
