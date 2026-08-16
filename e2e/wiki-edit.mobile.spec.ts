import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { loginAsAdmin } from "./helpers/auth";
import {
  createUntitledWikiPage,
  waitForHydratedWikiEditor,
  wikiPageUrl,
} from "./helpers/wiki";
import { emulateColorScheme } from "./helpers/theme";
import { deleteObjects } from "../src/lib/minio";
import { PAGE_IDS } from "../scripts/seed-data";

const MOBILE_VIEWPORT = { width: 393, height: 851 };
const NARROW_MOBILE_WIDTHS = [360, 375] as const;
const mobileCreatedIds: string[] = [];
const MOBILE_NAV_PAGE_ID = randomUUID();
let gettingStartedBaseline = "";
const MOBILE_UPLOAD_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+AvzZAAAAAElFTkSuQmCC",
  "base64",
);

async function setGettingStartedIcon(icon: string | null) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("update wiki_pages set icon = $1 where id = $2", [
      icon,
      PAGE_IDS.gettingStarted,
    ]);
  } finally {
    await client.end();
  }
}

async function readWikiContent(pageId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ content: string }>(
      "select content from wiki_pages where id = $1",
      [pageId],
    );
    return result.rows[0]?.content ?? "";
  } finally {
    await client.end();
  }
}

async function restoreWikiContent(pageId: string, content: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("update wiki_pages set content = $1 where id = $2", [
      content,
      pageId,
    ]);
  } finally {
    await client.end();
  }
}

async function closePageAndRestoreWikiContent(
  page: Page,
  pageId: string,
  content: string,
) {
  if (!page.isClosed()) await page.close();
  await restoreWikiContent(pageId, content);
}

async function countDiscussionsByContent(content: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from discussions where content = $1",
      [content],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function deleteDiscussionsByContent(content: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from discussions where content = $1", [content]);
  } finally {
    await client.end();
  }
}

async function createMobileNavigationFixture() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `
        insert into wiki_pages (
          id, title, icon, content, parent_id, sort_order, deleted_at,
          created_by, updated_by, created_at, updated_at
        )
        select
          $1, 'Mobile navigation fixture', icon, content, null, 999, null,
          created_by, updated_by,
          date_trunc('milliseconds', now()),
          date_trunc('milliseconds', now())
        from wiki_pages
        where id = $2
      `,
      [MOBILE_NAV_PAGE_ID, PAGE_IDS.gettingStarted],
    );
  } finally {
    await client.end();
  }
}

async function addNavigationTarget(page: Page) {
  await page.evaluate((welcomePageId) => {
    const anchor = document.createElement("a");
    anchor.href = `/wiki/${welcomePageId}`;
    anchor.dataset.testid = "mobile-navigation-target";
    anchor.textContent = "Leave editor";
    (document.querySelector('[role="dialog"]') ?? document.body).append(anchor);
  }, PAGE_IDS.welcome);
}

async function selectText(page: Page, text: string) {
  const hydratedEditor = page.locator(
    '[data-testid="wiki-editor-shell"][data-editor-hydrated="true"]',
  );
  await expect(hydratedEditor).toHaveCount(1);
  const editor = hydratedEditor.locator('[data-slate-editor="true"]');
  await expect(editor).toHaveCount(1);
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

async function placeCaretAfterText(page: Page, text: string) {
  await selectText(page, text);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-slate-editor="true"]')).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => window.getSelection()?.isCollapsed ?? false),
    )
    .toBe(true);
}

test.describe("mobile wiki editing", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: MOBILE_VIEWPORT,
  });

  test.beforeAll(async () => {
    gettingStartedBaseline = await readWikiContent(PAGE_IDS.gettingStarted);
    await createMobileNavigationFixture();
  });

  test.beforeEach(async ({ page }) => {
    await restoreWikiContent(PAGE_IDS.gettingStarted, gettingStartedBaseline);
    await loginAsAdmin(page);
    await page.goto(`/wiki/${PAGE_IDS.gettingStarted}`);
  });

  test.afterEach(async ({ page }) => {
    if (!page.isClosed()) await page.close();
    await restoreWikiContent(PAGE_IDS.gettingStarted, gettingStartedBaseline);
  });

  test.afterAll(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("delete from wiki_pages where id = $1", [
        MOBILE_NAV_PAGE_ID,
      ]);
      if (mobileCreatedIds.length > 0) {
        await client.query("delete from wiki_pages where id = any($1)", [
          mobileCreatedIds,
        ]);
      }
    } finally {
      await client.end();
    }
  });

  test("focused content exposes one inset touch toolbar without duplicating the editor", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');

    await expect(editor).toHaveCount(1);
    await editor.click();

    const toolbar = page.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });
    await expect(toolbar).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "插入块", exact: true }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "转换块类型", exact: true }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "插入块", exact: true }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    await expect(
      toolbar.getByRole("button", { name: "插入块", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      toolbar.getByRole("button", { name: "转换块类型", exact: true }),
    ).toHaveAttribute("aria-haspopup", "dialog");

    const toolbarBox = await toolbar.boundingBox();
    const insertBox = await toolbar
      .getByRole("button", { name: "插入块", exact: true })
      .boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(insertBox).not.toBeNull();
    expect(toolbarBox!.x).toBeGreaterThanOrEqual(12);
    expect(toolbarBox!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width - 24);
    expect(insertBox!.width).toBeGreaterThanOrEqual(44);
    expect(insertBox!.height).toBeGreaterThanOrEqual(44);
    const turnIntoLabel = toolbar.getByText("Turn into", { exact: true });
    await expect(turnIntoLabel).toBeVisible();
    expect(
      await turnIntoLabel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await expect(editor).toHaveCount(1);
  });

  test("the action strip follows body focus and resets before the next edit", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    const toolbar = page.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });
    await editor.click();
    await expect(toolbar).toBeVisible();

    await page.getByRole("textbox", { name: "页面标题" }).click();
    await expect(toolbar).toHaveCount(0);

    await editor.click();
    await expect(toolbar).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "插入块", exact: true }),
    ).toBeVisible();
  });

  test("the focused editor exposes Notion Mobile Web's floating action strip", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    const toolbar = page.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });

    await expect
      .poll(() =>
        toolbar
          .locator("button")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute("aria-label")),
          ),
      )
      .toEqual([
        "插入块",
        "转换块类型",
        "提及页面",
        "添加批注",
        "插入图片",
        "删除当前块",
        "收起键盘",
      ]);

    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(toolbarBox!.x).toBeGreaterThanOrEqual(12);
    expect(toolbarBox!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width - 24);
    expect(
      await toolbar.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).borderRadius),
      ),
    ).toBeGreaterThanOrEqual(16);

    const actionBoxes = await toolbar.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { height: box.height, width: box.width };
      }),
    );
    for (const box of actionBoxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the complete action strip fits common 360px and 375px mobile viewports", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');

    for (const width of NARROW_MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: MOBILE_VIEWPORT.height });
      await editor.click();

      const toolbar = page.getByRole("toolbar", {
        name: "键盘上方编辑工具",
      });
      await expect(toolbar).toBeVisible();

      const scroller = toolbar.getByTestId("mobile-editor-action-scroll");
      expect(
        await scroller.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect(
        await toolbar
          .getByText("Turn into", { exact: true })
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);

      const toolbarBox = await toolbar.boundingBox();
      expect(toolbarBox).not.toBeNull();
      const actionBoxes = await toolbar
        .locator("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const box = button.getBoundingClientRect();
            return {
              height: box.height,
              left: box.left,
              right: box.right,
              width: box.width,
            };
          }),
        );
      for (const box of actionBoxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.left).toBeGreaterThanOrEqual(toolbarBox!.x);
        expect(box.right).toBeLessThanOrEqual(
          toolbarBox!.x + toolbarBox!.width,
        );
      }
    }
  });

  test("the floating action strip follows the visual viewport above the software keyboard", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    const toolbar = page.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });
    await expect(toolbar).toBeVisible();

    const emulatedVisualHeight = 440;
    const emulatedVisualOffsetTop = 80;
    await page.evaluate(
      ({ height, offsetTop }) => {
        if (!window.visualViewport) {
          throw new Error("visualViewport is unavailable");
        }
        Object.defineProperty(window.visualViewport, "height", {
          configurable: true,
          value: height,
        });
        Object.defineProperty(window.visualViewport, "offsetTop", {
          configurable: true,
          value: offsetTop,
        });
        window.visualViewport.dispatchEvent(new Event("resize"));
      },
      { height: emulatedVisualHeight, offsetTop: emulatedVisualOffsetTop },
    );

    await expect
      .poll(async () => {
        const box = await toolbar.boundingBox();
        return box ? box.y + box.height : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(emulatedVisualOffsetTop + emulatedVisualHeight - 8);

    const scrollContainer = page.getByTestId("wiki-editor-scroll-container");
    expect(
      await scrollContainer.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).scrollPaddingBottom),
      ),
    ).toBeGreaterThanOrEqual(64);

    await page.evaluate((height) => {
      if (!window.visualViewport) {
        throw new Error("visualViewport is unavailable");
      }
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        value: height,
      });
      Object.defineProperty(window.visualViewport, "offsetTop", {
        configurable: true,
        value: 0,
      });
      window.visualViewport.dispatchEvent(new Event("resize"));
    }, MOBILE_VIEWPORT.height);

    await expect(toolbar).toHaveCount(0);
    await expect(editor).not.toBeFocused();
  });

  test("the mobile page bar follows Notion Mobile Web's menu-title-actions structure", async ({
    page,
  }) => {
    const topbar = page.getByRole("banner", { name: "编辑器顶栏" });

    await expect(
      topbar.getByRole("button", { name: "打开导航" }),
    ).toBeVisible();
    await expect(topbar.getByRole("button", { name: "共享" })).toBeVisible();
    await expect(topbar.getByRole("link", { name: "返回 Wiki" })).toHaveCount(
      0,
    );
    await expect(topbar.getByRole("button", { name: "打开批注" })).toHaveCount(
      0,
    );
    await expect(topbar).toContainText("Getting Started");

    const [
      menuIcon,
      shareIcon,
      moreIcon,
      topbarText,
      shareButton,
      settingsButton,
    ] = await Promise.all([
      topbar
        .getByRole("button", { name: "打开导航" })
        .locator("svg")
        .boundingBox(),
      topbar.getByRole("button", { name: "共享" }).locator("svg").boundingBox(),
      topbar
        .getByRole("button", { name: "页面设置" })
        .locator("svg")
        .boundingBox(),
      topbar
        .getByText("Getting Started", { exact: true })
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      topbar.getByRole("button", { name: "共享" }).boundingBox(),
      topbar.getByRole("button", { name: "页面设置" }).boundingBox(),
    ]);
    expect(menuIcon!.width).toBeGreaterThanOrEqual(22);
    expect(shareIcon!.width).toBeGreaterThanOrEqual(23);
    expect(moreIcon!.width).toBeGreaterThanOrEqual(21);
    expect(topbarText).toBeGreaterThanOrEqual(17);
    expect(shareButton!.width).toBeGreaterThanOrEqual(44);
    expect(shareButton!.height).toBeGreaterThanOrEqual(44);
    expect(settingsButton!.width).toBeGreaterThanOrEqual(44);
    expect(settingsButton!.height).toBeGreaterThanOrEqual(44);

    await topbar.getByRole("button", { name: "页面设置" }).click();
    const parentSelect = page
      .getByRole("dialog", { name: "页面设置" })
      .getByRole("combobox", { name: "父页面" });
    await expect
      .poll(async () => (await parentSelect.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
  });

  test("dark mode uses Notion Mobile Web's charcoal editor surface", async ({
    page,
  }) => {
    await emulateColorScheme(page, "dark");

    const editorShell = page.getByTestId("wiki-editor-shell");
    const header = page.getByRole("banner", { name: "编辑器顶栏" });
    await expect(editorShell).toHaveCSS("background-color", "rgb(25, 25, 25)");
    await expect(header).toHaveCSS("background-color", "rgb(25, 25, 25)");
  });

  test("the page icon sits inline with the title at Notion Mobile Web spacing", async ({
    page,
  }) => {
    await setGettingStartedIcon("🗺️");
    try {
      await page.reload();
      await waitForHydratedWikiEditor(page);
      const topbar = page.getByRole("banner", { name: "编辑器顶栏" });
      const document = page.getByTestId("wiki-editor-document").first();
      const icon = page.getByRole("button", {
        name: "更改页面图标，当前为 🗺️",
      });
      const title = page.getByRole("textbox", { name: "页面标题" });
      await expect(topbar).toBeVisible();
      await expect(document).toBeVisible();
      await expect(icon).toBeVisible();
      await expect(title).toBeVisible();

      const [topbarBox, documentPadding, iconBox, titleBox] = await Promise.all(
        [
          topbar.boundingBox(),
          document.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).paddingLeft),
          ),
          icon.boundingBox(),
          title.boundingBox(),
        ],
      );
      expect(topbarBox).not.toBeNull();
      expect(iconBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      expect(documentPadding).toBe(24);
      expect(iconBox!.height).toBeLessThanOrEqual(44);
      expect(Math.abs(iconBox!.y - titleBox!.y)).toBeLessThanOrEqual(4);
      expect(titleBox!.x).toBeGreaterThanOrEqual(iconBox!.x + iconBox!.width);
      expect(
        titleBox!.y - (topbarBox!.y + topbarBox!.height),
      ).toBeLessThanOrEqual(36);
    } finally {
      await setGettingStartedIcon(null);
    }
  });

  test("an expanded text selection replaces default actions with inline formatting", async ({
    page,
  }) => {
    await selectText(page, "New to CUHK?");

    const toolbar = page.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });
    for (const name of [
      "粗体",
      "斜体",
      "链接",
      "行内代码",
      "添加批注",
      "更多格式",
    ]) {
      await expect(toolbar.getByRole("button", { name })).toBeVisible();
    }
    await expect(
      toolbar.getByRole("button", { name: "插入块", exact: true }),
    ).toHaveCount(0);
  });

  test("Insert opens Notion Mobile Web's full-screen single-column block list", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      // Next's dev-tools launcher occupies the same bottom-edge pixels in the
      // dev-server verification profile; production has no such overlay.
      .dispatchEvent("click");

    await expect(
      page.getByRole("toolbar", { name: "键盘上方编辑工具" }),
    ).toHaveCount(0);

    const sheet = page.getByRole("dialog", { name: "插入块" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "取消" })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "基础块" })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "标题 1", exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "标题 4", exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "图片", exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: "丰富内容" }),
    ).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "提示框" })).toBeVisible();
    await expect(sheet.getByText("页面内最高层级标题")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByTestId("mobile-editor-backdrop")).toHaveCount(0);

    const firstCells = sheet.locator('[data-testid="mobile-insert-cell"]');
    expect(await firstCells.count()).toBeGreaterThanOrEqual(14);
    const firstCellBox = await firstCells.first().boundingBox();
    expect(firstCellBox).not.toBeNull();
    expect(firstCellBox!.height).toBeGreaterThanOrEqual(44);
    expect(firstCellBox!.height).toBeLessThanOrEqual(50);

    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.x).toBe(0);
    expect(sheetBox!.y).toBe(0);
    expect(sheetBox!.width).toBe(MOBILE_VIEWPORT.width);
    expect(sheetBox!.height).toBe(MOBILE_VIEWPORT.height);
  });

  test("Turn into opens a full-screen list and marks the current block type", async ({
    page,
  }) => {
    const firstBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await firstBlock.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "转换块类型", exact: true })
      .dispatchEvent("click");

    await expect(
      page.getByRole("toolbar", { name: "键盘上方编辑工具" }),
    ).toHaveCount(0);

    const sheet = page.getByRole("dialog", { name: "Turn into" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "取消" })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "正文", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      sheet.getByRole("button", { name: "标题 1", exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "标题 4", exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "项目列表", exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "代码块", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("mobile-editor-backdrop")).toHaveCount(0);

    const rows = sheet.locator('[data-testid="mobile-turn-into-cell"]');
    expect(await rows.count()).toBeGreaterThanOrEqual(10);
    const firstRowBox = await rows.first().boundingBox();
    expect(firstRowBox).not.toBeNull();
    expect(firstRowBox!.height).toBeGreaterThanOrEqual(44);
    expect(firstRowBox!.height).toBeLessThanOrEqual(50);
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox).toEqual({
      x: 0,
      y: 0,
      width: MOBILE_VIEWPORT.width,
      height: MOBILE_VIEWPORT.height,
    });
  });

  test("the image action opens the platform image chooser directly", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();

    const chooserPromise = page.waitForEvent("filechooser");
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入图片", exact: true })
      .click({ force: true });
    const chooser = await chooserPromise;

    expect(await chooser.element().getAttribute("accept")).toBe("image/*");
    expect(chooser.isMultiple()).toBe(true);

    await editor.evaluate((element) => (element as HTMLElement).blur());
    await expect(editor).not.toBeFocused();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(editor).toBeFocused();
    await chooser.setFiles([]);
    await expect(page.getByText("Add an image")).toHaveCount(0);
  });

  test("the mobile image action uploads a selected file into the document", async ({
    page,
  }) => {
    const originalContent = await readWikiContent(PAGE_IDS.gettingStarted);
    let uploadedKey: string | null = null;

    try {
      const editor = page.locator('[data-slate-editor="true"]');
      await editor.click();
      const chooserPromise = page.waitForEvent("filechooser");
      await page
        .getByRole("toolbar", { name: "键盘上方编辑工具" })
        .getByRole("button", { name: "插入图片", exact: true })
        .click({ force: true });
      const chooser = await chooserPromise;

      await chooser.setFiles({
        name: "mobile-pixel.png",
        mimeType: "image/png",
        buffer: MOBILE_UPLOAD_PNG,
      });

      const image = editor.locator('img[src*="/api/wiki-assets/"]').last();
      await expect(image).toBeVisible({ timeout: 15_000 });
      const url = await image.getAttribute("src");
      expect(url).toMatch(/^\/api\/wiki-assets\/wiki-assets\/[\w-]+\.png$/);
      uploadedKey = url!.replace("/api/wiki-assets/", "");
      expect((await page.request.get(url!)).status()).toBe(200);
      await expect(editor).toBeFocused();
    } finally {
      await closePageAndRestoreWikiContent(
        page,
        PAGE_IDS.gettingStarted,
        originalContent,
      );
      if (uploadedKey) await deleteObjects([uploadedKey]);
    }
  });

  test("the mention action opens the real wiki page picker at the caret", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "提及页面", exact: true })
      .click({ force: true });

    const picker = page.getByRole("combobox", {
      name: "提及 Wiki 页面",
    });
    await expect(picker).toBeFocused();
    await expect(picker).toHaveAttribute("aria-label", "提及 Wiki 页面");
    await expect(picker).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Wiki 页面", { exact: true })).toBeVisible();
    const options = page.getByRole("option");
    expect(await options.count()).toBeGreaterThan(0);
    await expect(options.first()).toBeVisible();
    await expect(editor).toContainText("@");
    await expect(editor).not.toContainText("[[");

    const [popoverBox, optionBox] = await Promise.all([
      page.getByTestId("wiki-link-picker").boundingBox(),
      options.first().boundingBox(),
    ]);
    expect(popoverBox).not.toBeNull();
    expect(optionBox).not.toBeNull();
    expect(popoverBox!.width).toBeGreaterThanOrEqual(330);
    expect(optionBox!.height).toBeGreaterThanOrEqual(44);
    await expect(options.first()).toHaveAttribute("data-active-item", "true");
    expect(
      await options.first().evaluate((element) => {
        const parse = (color: string) => {
          const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
          return {
            red: channels[0] ?? 0,
            green: channels[1] ?? 0,
            blue: channels[2] ?? 0,
            alpha: channels.length === 4 ? channels[3] : 1,
          };
        };
        const item = parse(getComputedStyle(element).backgroundColor);
        const surface = parse(
          getComputedStyle(element.closest('[data-testid="wiki-link-picker"]')!)
            .backgroundColor,
        );
        const composite = (channel: number, surfaceChannel: number) =>
          channel * item.alpha + surfaceChannel * (1 - item.alpha);
        return Math.max(
          Math.abs(composite(item.red, surface.red) - surface.red),
          Math.abs(composite(item.green, surface.green) - surface.green),
          Math.abs(composite(item.blue, surface.blue) - surface.blue),
        );
      }),
    ).toBeGreaterThanOrEqual(12);
  });

  test("browser Back closes the mention picker before leaving the editor", async ({
    page,
  }) => {
    const originalContent = await readWikiContent(PAGE_IDS.gettingStarted);
    try {
      const editor = page.locator('[data-slate-editor="true"]');
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("wiki-link-picker")).toHaveCount(0);
      await editor.click();
      const editUrl = page.url();
      await page
        .getByRole("toolbar", { name: "键盘上方编辑工具" })
        .getByRole("button", { name: "提及页面", exact: true })
        .click({ force: true });

      const picker = page.getByRole("combobox", {
        name: "提及 Wiki 页面",
      });
      await expect(picker).toBeFocused();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window.history.state as {
                  cupediaMobileMentionToken?: string;
                } | null
              )?.cupediaMobileMentionToken ?? null,
          ),
        )
        .not.toBeNull();

      await page.goBack();

      await expect(picker).toHaveCount(0);
      expect(page.url()).toBe(editUrl);
      await expect(editor).toBeFocused();
      await expect(page.getByTestId("wiki-autosave-status")).toHaveText(
        "已保存",
      );
      expect(await readWikiContent(PAGE_IDS.gettingStarted)).toBe(
        originalContent,
      );

      await page.goForward();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window.history.state as {
                  cupediaMobileMentionToken?: string;
                } | null
              )?.cupediaMobileMentionToken ?? null,
          ),
        )
        .not.toBeNull();
      await expect(picker).toBeFocused();
      expect(page.url()).toBe(editUrl);
    } finally {
      await closePageAndRestoreWikiContent(
        page,
        PAGE_IDS.gettingStarted,
        originalContent,
      );
    }
  });

  test("navigating with the mention picker open is not undone by cleanup", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "提及页面", exact: true })
      .click({ force: true });
    await expect(
      page.getByRole("combobox", { name: "提及 Wiki 页面" }),
    ).toBeFocused();

    await addNavigationTarget(page);
    await page.getByTestId("mobile-navigation-target").click({ force: true });

    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.welcome));
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      "Welcome to CUpedia",
    );
  });

  test("the comment action opens a compact bottom composer", async ({
    page,
  }) => {
    const originalContent = await readWikiContent(PAGE_IDS.gettingStarted);
    await selectText(page, "New to CUHK?");
    const selectionActions = page.getByTestId("mobile-selection-actions");
    await expect(selectionActions).toBeVisible();
    await selectionActions
      .getByRole("button", { name: "添加批注", exact: true })
      // The Next.js development indicator can overlap the fixed mobile strip.
      // The production build has no such portal; dispatch the intended tap.
      .dispatchEvent("click");

    const composer = page.getByRole("dialog", { name: "添加批注" });
    await expect(composer).toBeVisible();
    const composerBox = await composer.boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox!.height).toBeLessThanOrEqual(88);
    const backdrop = page.getByTestId("mobile-comment-backdrop");
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS("backdrop-filter", "none");
    await expect(
      page.getByRole("toolbar", { name: "键盘上方编辑工具" }),
    ).toHaveCount(0);
    await expect(
      composer.getByRole("textbox", { name: "批注内容" }),
    ).toBeFocused();
    await expect(
      composer.getByRole("textbox", { name: "批注内容" }),
    ).toHaveAttribute("aria-label", "批注内容");
    await expect(
      composer.getByRole("button", { name: "取消批注" }),
    ).toHaveCount(1);
    const avatarBox = await composer
      .getByTestId("mobile-comment-author-avatar")
      .boundingBox();
    expect(avatarBox).not.toBeNull();
    expect(avatarBox!.width).toBe(24);
    expect(avatarBox!.height).toBe(24);
    expect(
      await composer
        .getByTestId("mobile-comment-author-avatar")
        .locator('[data-slot="avatar"]')
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).borderRadius),
        ),
    ).toBeGreaterThanOrEqual(12);
    const submit = composer.getByRole("button", { name: "提交" });
    await expect
      .poll(async () => {
        const box = await submit.boundingBox();
        return box ? Math.min(box.width, box.height) : 0;
      })
      .toBeGreaterThanOrEqual(44);
    const draftComment = page.locator(
      '[data-slate-editor="true"] [data-comment-id="draft"]',
    );
    await expect(draftComment).toBeVisible();
    await expect(draftComment).toHaveCSS("border-bottom-width", "0px");

    const emulatedVisualHeight = 440;
    const emulatedVisualOffsetTop = 80;
    await page.evaluate(
      ({ height, offsetTop }) => {
        if (!window.visualViewport) {
          throw new Error("visualViewport is unavailable");
        }
        Object.defineProperty(window.visualViewport, "height", {
          configurable: true,
          value: height,
        });
        Object.defineProperty(window.visualViewport, "offsetTop", {
          configurable: true,
          value: offsetTop,
        });
        window.visualViewport.dispatchEvent(new Event("resize"));
      },
      { height: emulatedVisualHeight, offsetTop: emulatedVisualOffsetTop },
    );

    await expect
      .poll(async () => {
        const box = await composer.boundingBox();
        return box ? box.y + box.height : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(emulatedVisualOffsetTop + emulatedVisualHeight);

    await page.keyboard.press("Escape");
    await expect(composer).toHaveCount(0);
    await expect(
      page.locator('[data-slate-editor="true"] .border-yellow-400'),
    ).toHaveCount(0);
    await expect(page.locator('[data-slate-editor="true"]')).toBeFocused();
    await expect(page.getByTestId("wiki-autosave-status")).toHaveText("已保存");
    expect(await readWikiContent(PAGE_IDS.gettingStarted)).toBe(
      originalContent,
    );
  });

  test("temporary comment marks stay out of autosave and Back cancels the composer first", async ({
    page,
  }) => {
    const originalContent = await readWikiContent(PAGE_IDS.gettingStarted);
    try {
      const firstBlock = page
        .getByTestId("wiki-editor-block")
        .filter({ hasText: "New to CUHK?" })
        .first();
      await firstBlock.click();
      await page
        .getByRole("toolbar", { name: "键盘上方编辑工具" })
        .getByRole("button", { name: "添加批注", exact: true })
        .click({ force: true });

      const composer = page.getByRole("dialog", { name: "添加批注" });
      await expect(composer).toBeVisible();
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        /^(idle|saved)$/,
        { timeout: 15_000 },
      );
      expect(await readWikiContent(PAGE_IDS.gettingStarted)).toBe(
        originalContent,
      );

      const editUrl = page.url();
      await page.goBack();
      await expect(composer).toHaveCount(0);
      expect(page.url()).toBe(editUrl);
      await expect(page.locator('[data-slate-editor="true"]')).toBeFocused();

      await page.goForward();
      await expect(composer).toBeVisible();
      expect(page.url()).toBe(editUrl);
    } finally {
      await closePageAndRestoreWikiContent(
        page,
        PAGE_IDS.gettingStarted,
        originalContent,
      );
    }
  });

  test("navigating with the compact composer open is not undone by cleanup", async ({
    page,
  }) => {
    const firstBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await firstBlock.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "添加批注", exact: true })
      .click({ force: true });
    await expect(page.getByRole("dialog", { name: "添加批注" })).toBeVisible();

    await addNavigationTarget(page);
    await page.getByTestId("mobile-navigation-target").click({ force: true });

    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.welcome));
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      "Welcome to CUpedia",
    );
  });

  test("canceling the compact composer consumes its temporary history entry", async ({
    page,
  }) => {
    const firstBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await firstBlock.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "添加批注", exact: true })
      .click({ force: true });

    const composer = page.getByRole("dialog", { name: "添加批注" });
    await expect(composer).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window.history.state as {
                cupediaMobileCommentComposerToken?: string;
              } | null
            )?.cupediaMobileCommentComposerToken ?? null,
        ),
      )
      .not.toBeNull();

    await composer
      .getByRole("button", { name: "取消批注" })
      .evaluate((button) => (button as HTMLButtonElement).click());

    await expect(composer).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window.history.state as {
                cupediaMobileCommentComposerToken?: string;
              } | null
            )?.cupediaMobileCommentComposerToken ?? null,
        ),
      )
      .toBeNull();
  });

  test("rapid comment submission creates only one discussion", async ({
    page,
  }) => {
    const content = `mobile-comment-${randomUUID().slice(0, 8)}`;
    const originalContent = await readWikiContent(PAGE_IDS.gettingStarted);
    try {
      const firstBlock = page
        .getByTestId("wiki-editor-block")
        .filter({ hasText: "New to CUHK?" })
        .first();
      await firstBlock.click();
      await page
        .getByRole("toolbar", { name: "键盘上方编辑工具" })
        .getByRole("button", { name: "添加批注", exact: true })
        .click({ force: true });

      const composer = page.getByRole("dialog", { name: "添加批注" });
      await composer.getByPlaceholder("输入批注内容…").fill(content);
      const submit = composer.getByRole("button", { name: "提交" });
      await submit.evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });

      await expect
        .poll(() => countDiscussionsByContent(content), { timeout: 15_000 })
        .toBeGreaterThan(0);
      expect(await countDiscussionsByContent(content)).toBe(1);
    } finally {
      if (!page.isClosed()) await page.close();
      await deleteDiscussionsByContent(content);
      await restoreWikiContent(PAGE_IDS.gettingStarted, originalContent);
    }
  });

  test("deleting the active block offers an immediate undo", async ({
    page,
  }) => {
    const matchingBlocks = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" });
    await placeCaretAfterText(page, "New to CUHK?");
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "删除当前块", exact: true })
      .click({ force: true });

    await expect(matchingBlocks).toHaveCount(0);
    const undo = page.getByRole("button", { name: "撤销", exact: true });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(matchingBlocks).toHaveCount(1);
    await expect(page.locator('[data-slate-editor="true"]')).toBeFocused();
  });

  test("browser back closes a full-screen editor surface before leaving the page", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    const editUrl = page.url();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      .dispatchEvent("click");
    const sheet = page.getByRole("dialog", { name: "插入块" });
    await expect(sheet).toBeVisible();

    await page.goBack();

    await expect(sheet).toHaveCount(0);
    expect(page.url()).toBe(editUrl);
    await expect(editor).toBeFocused();
  });

  test("browser forward restores the temporary surface instead of creating a dead history entry", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      .dispatchEvent("click");
    const sheet = page.getByRole("dialog", { name: "插入块" });
    await expect(sheet).toBeVisible();

    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await page.goForward();

    await expect(sheet).toBeVisible();
    await expect(page.locator('[data-slate-editor="true"]')).toHaveCount(1);
  });

  test("Forward restores a surface after focus moved out of the editor", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      .dispatchEvent("click");
    const sheet = page.getByRole("dialog", { name: "插入块" });
    await expect(sheet).toBeVisible();

    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await page.getByRole("textbox", { name: "页面标题" }).click();
    await expect(
      page.getByRole("toolbar", { name: "键盘上方编辑工具" }),
    ).toHaveCount(0);
    await page.goForward();

    await expect(sheet).toBeVisible();
    await expect(editor).toHaveCount(1);
  });

  test("browser back closes the Format accessory before leaving the editor", async ({
    page,
  }) => {
    await selectText(page, "New to CUHK?");
    const editUrl = page.url();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "更多格式" })
      .dispatchEvent("click");
    const panel = page.getByRole("region", { name: "文本样式" });
    await expect(panel).toBeVisible();

    await page.goBack();

    await expect(panel).toHaveCount(0);
    expect(page.url()).toBe(editUrl);
    await expect(page.locator('[data-slate-editor="true"]')).toBeFocused();
  });

  test("same-origin navigation waits for the latest autosave before leaving", async ({
    page,
  }) => {
    const savedTitle = `Mobile nav saved ${Date.now()}`;
    await page.goto(`/wiki/${MOBILE_NAV_PAGE_ID}`);

    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let markResponseHeld!: () => void;
    const responseHeld = new Promise<void>((resolve) => {
      markResponseHeld = resolve;
    });
    let held = false;
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && !held) {
        held = true;
        markResponseHeld();
        await responseGate;
        await route.continue();
        return;
      }
      await route.continue();
    });

    await page.getByRole("textbox", { name: "页面标题" }).fill(savedTitle);
    await addNavigationTarget(page);
    await page.getByTestId("mobile-navigation-target").click();
    await responseHeld;

    await expect(page).toHaveURL(wikiPageUrl(MOBILE_NAV_PAGE_ID));
    releaseResponse();
    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.welcome), {
      timeout: 15_000,
    });

    await page.goto(`/wiki/${MOBILE_NAV_PAGE_ID}`);
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      savedTitle,
    );
  });

  test("failed navigation autosave leaves the draft in the editor", async ({
    page,
  }) => {
    const draftTitle = `Mobile nav failed ${Date.now()}`;
    await page.goto(`/wiki/${MOBILE_NAV_PAGE_ID}`);
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("textbox", { name: "页面标题" }).fill(draftTitle);
    await addNavigationTarget(page);
    await page.getByTestId("mobile-navigation-target").click();

    await expect(page).toHaveURL(wikiPageUrl(MOBILE_NAV_PAGE_ID));
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      draftTitle,
    );
    await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
      "保存失败，请检查网络后重试",
    );
  });

  test("browser back also waits for autosave before traversing history", async ({
    page,
  }) => {
    const savedTitle = `Mobile back saved ${Date.now()}`;
    await page.goto("/wiki");
    await page.goto(`/wiki/${MOBILE_NAV_PAGE_ID}`);
    await expect(page).toHaveURL(wikiPageUrl(MOBILE_NAV_PAGE_ID));
    await page.getByRole("textbox", { name: "页面标题" }).fill(savedTitle);

    await page.goBack();

    await expect(page).toHaveURL(/\/wiki$/, {
      timeout: 15_000,
    });
    await page.goto(`/wiki/${MOBILE_NAV_PAGE_ID}`);
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      savedTitle,
    );
  });

  test("browser Back still flushes when the Navigation API is unavailable", async ({
    page,
  }) => {
    const savedTitle = `Mobile fallback saved ${Date.now()}`;
    await page.addInitScript(() => {
      Object.defineProperty(window, "navigation", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window, "NavigateEvent", {
        configurable: true,
        value: undefined,
      });
    });
    await page.goto("/wiki");
    await page.goto(`/wiki/${MOBILE_NAV_PAGE_ID}`);
    expect(
      await page.evaluate(
        () => (window as Window & { navigation?: unknown }).navigation,
      ),
    ).toBeUndefined();

    await expect(page).toHaveURL(wikiPageUrl(MOBILE_NAV_PAGE_ID));
    await page.getByRole("textbox", { name: "页面标题" }).fill(savedTitle);
    await page.goBack();

    await expect(page).toHaveURL(/\/wiki$/, {
      timeout: 15_000,
    });
    await page.goto(`/wiki/${MOBILE_NAV_PAGE_ID}`);
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      savedTitle,
    );
  });

  test("a new page autosaves before browser Back", async ({ page }) => {
    await createUntitledWikiPage(page);
    mobileCreatedIds.push(new URL(page.url()).pathname.split("/").at(-1)!);
    await page
      .getByRole("textbox", { name: "页面标题" })
      .fill("Unsaved mobile page");
    await page.locator('[data-slate-editor="true"]').fill("Unsaved body");
    const createUrl = page.url();
    await page.goBack();
    await expect(page).not.toHaveURL(createUrl);
    await page.goto(createUrl);
    await expect(page.getByRole("textbox", { name: "页面标题" })).toHaveValue(
      "Unsaved mobile page",
    );
    await expect(
      page.locator('[data-slate-editor="true"]').first(),
    ).toContainText("Unsaved body");
  });

  test("an Insert command restores its block location and typing continues in the new block", async ({
    page,
  }) => {
    const firstBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await firstBlock.click();
    await page.keyboard.press("End");
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      .dispatchEvent("click");

    const sheet = page.getByRole("dialog", { name: "插入块" });
    await sheet
      .getByRole("button", { name: "标题 3", exact: true })
      .dispatchEvent("click");

    const editor = page.locator('[data-slate-editor="true"]');
    await expect(sheet).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const anchor = window.getSelection()?.anchorNode;
          const element =
            anchor instanceof Element ? anchor : anchor?.parentElement;
          return element?.closest("h3")?.tagName ?? null;
        }),
      )
      .toBe("H3");
    await page.keyboard.type("Mobile heading");
    await expect(
      editor.getByRole("heading", { name: "Mobile heading", level: 3 }),
    ).toBeVisible();
    await expect(editor).toHaveCount(1);
  });

  test("nested table insertion and deletion preserve a legal selection in the same cell", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PAGE_IDS.richContent}`);
    const editor = await waitForHydratedWikiEditor(page, PAGE_IDS.richContent);
    await editor.click();
    const cell = editor.locator("td").filter({ hasText: "CSCI1130" }).first();
    await cell.getByText("CSCI1130", { exact: true }).click();
    await page.keyboard.press("End");
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      .dispatchEvent("click");
    await page
      .getByRole("dialog", { name: "插入块" })
      .getByRole("button", { name: "标题 4", exact: true })
      .dispatchEvent("click");
    await expect(page.getByRole("dialog", { name: "插入块" })).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const anchor = window.getSelection()?.anchorNode;
          const element =
            anchor instanceof Element ? anchor : anchor?.parentElement;
          const heading = element?.closest("h4");
          return heading?.closest("td")?.textContent ?? null;
        }),
      )
      .toContain("CSCI1130");
    await page.keyboard.type("Nested heading");

    const nestedHeading = editor.getByRole("heading", {
      name: "Nested heading",
      level: 4,
    });
    await expect(nestedHeading).toBeVisible();
    await expect(nestedHeading.locator("xpath=ancestor::td")).toContainText(
      "CSCI1130",
    );
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "删除当前块", exact: true })
      .click({ force: true });

    await expect(nestedHeading).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const anchor = window.getSelection()?.anchorNode;
          const element =
            anchor instanceof Element ? anchor : anchor?.parentElement;
          return element?.closest("td")?.textContent ?? null;
        }),
      )
      .toContain("CSCI1130");
  });

  test("deleting the inner block of a callout keeps a legal editable selection", async ({
    page,
  }) => {
    const originalContent = await readWikiContent(PAGE_IDS.richContent);
    const marker = `Callout remains editable ${randomUUID().slice(0, 8)}`;

    try {
      await page.goto(`/wiki/${PAGE_IDS.richContent}`);
      const editor = await waitForHydratedWikiEditor(
        page,
        PAGE_IDS.richContent,
      );
      const calloutText = editor.getByText(
        "CUpedia is maintained by students — contribute freely.",
        { exact: true },
      );
      await calloutText.click();
      await page.keyboard.press("End");

      await page
        .getByRole("toolbar", { name: "键盘上方编辑工具" })
        .getByRole("button", { name: "删除当前块", exact: true })
        .click({ force: true });

      await expect(calloutText).toHaveCount(0);
      await expect(editor).toBeFocused();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const root = document.querySelector('[data-slate-editor="true"]');
            const anchor = window.getSelection()?.anchorNode;
            return Boolean(root && anchor && root.contains(anchor));
          }),
        )
        .toBe(true);

      await page.keyboard.type(marker);
      await expect(editor).toContainText(marker);
    } finally {
      await closePageAndRestoreWikiContent(
        page,
        PAGE_IDS.richContent,
        originalContent,
      );
    }
  });

  test("deleting the only block leaves a focused editable paragraph", async ({
    page,
  }) => {
    await createUntitledWikiPage(page);
    mobileCreatedIds.push(new URL(page.url()).pathname.split("/").at(-1)!);
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "删除当前块", exact: true })
      .click({ force: true });

    await expect(editor).toBeFocused();
    await page.keyboard.type("Still editable");
    await expect(editor).toContainText("Still editable");
  });

  test("expanded text formatting stays in the keyboard accessory without dimming the page", async ({
    page,
  }) => {
    await selectText(page, "New to CUHK?");
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "更多格式", exact: true })
      .dispatchEvent("click");

    await expect(
      page.getByRole("toolbar", { name: "键盘上方编辑工具" }),
    ).toBeVisible();

    const panel = page.getByRole("region", { name: "文本样式" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "粗体" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "斜体" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "下划线" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "删除线" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "行内代码" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "文本样式" })).toHaveCount(0);
    await expect(page.getByTestId("mobile-editor-backdrop")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "插入块" })).toHaveCount(0);
  });

  test("a Format command restores the text selection and returns focus to Plate", async ({
    page,
  }) => {
    const originalContent = await readWikiContent(PAGE_IDS.gettingStarted);
    try {
      await selectText(page, "New to CUHK?");
      await page
        .getByRole("toolbar", { name: "键盘上方编辑工具" })
        .getByRole("button", { name: "更多格式" })
        .dispatchEvent("click");

      const panel = page.getByRole("region", { name: "文本样式" });
      await panel.getByRole("button", { name: "粗体" }).dispatchEvent("click");

      const editor = page.locator('[data-slate-editor="true"]');
      await expect(panel).toBeVisible();
      await expect(
        editor.locator("strong").filter({ hasText: "New to CUHK?" }),
      ).toBeVisible();
      await expect(editor).toBeFocused();
    } finally {
      await closePageAndRestoreWikiContent(
        page,
        PAGE_IDS.gettingStarted,
        originalContent,
      );
    }
  });

  test("Escape closes a sheet and restores the caret for immediate typing", async ({
    page,
  }) => {
    const firstBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await firstBlock.click();
    await page.keyboard.press("End");
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      .dispatchEvent("click");

    const sheet = page.getByRole("dialog", { name: "插入块" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");

    const editor = page.locator('[data-slate-editor="true"]');
    await expect(sheet).toHaveCount(0);
    await expect(editor).toBeFocused();
    await page.keyboard.type("!");
    await expect(firstBlock).toContainText("settle in.!");
  });

  test("IME composition does not trigger Slash commands or arm autosave mid-composition", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    const firstBlock = page
      .getByTestId("wiki-editor-block")
      .filter({ hasText: "New to CUHK?" })
      .first();
    await firstBlock.click();
    await page.keyboard.press("End");

    await editor.dispatchEvent("compositionstart", { data: "／" });
    await page.keyboard.type("/");

    await expect(page.getByTestId("slash-command-menu")).toHaveCount(0);
    await expect(
      page.getByRole("banner", { name: "编辑器顶栏" }),
    ).not.toContainText("未保存");

    await editor.dispatchEvent("compositionend", { data: "／" });
    await expect(firstBlock).toContainText("/");
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
  });

  test("rotation keeps the active sheet and the single Plate document", async ({
    page,
  }) => {
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.click();
    await page
      .getByRole("toolbar", { name: "键盘上方编辑工具" })
      .getByRole("button", { name: "插入块", exact: true })
      .dispatchEvent("click");

    const sheet = page.getByRole("dialog", { name: "插入块" });
    await expect(sheet).toBeVisible();
    await page.setViewportSize({ width: 851, height: 393 });

    await expect(sheet).toBeVisible();
    await expect(editor).toHaveCount(1);
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox).toEqual({ x: 0, y: 0, width: 851, height: 393 });
  });

  test("a Turn into command converts the active block and restores editor focus", async ({
    page,
  }) => {
    const originalContent = await readWikiContent(PAGE_IDS.gettingStarted);
    try {
      const firstBlock = page
        .getByTestId("wiki-editor-block")
        .filter({ hasText: "New to CUHK?" })
        .first();
      await firstBlock.click();
      await page.keyboard.press("End");
      await page
        .getByRole("toolbar", { name: "键盘上方编辑工具" })
        .getByRole("button", { name: "转换块类型", exact: true })
        .dispatchEvent("click");

      const sheet = page.getByRole("dialog", { name: "Turn into" });
      await sheet
        .getByRole("button", { name: "标题 2", exact: true })
        .dispatchEvent("click");

      const editor = page.locator('[data-slate-editor="true"]');
      await expect(sheet).toHaveCount(0);
      await expect(
        editor.getByRole("heading", { name: /New to CUHK\?/, level: 2 }),
      ).toBeVisible();
      await expect(editor).toBeFocused();
    } finally {
      await closePageAndRestoreWikiContent(
        page,
        PAGE_IDS.gettingStarted,
        originalContent,
      );
    }
  });

  test("mobile Done saves the current Plate draft and only dismisses focus", async ({
    page,
  }) => {
    await createUntitledWikiPage(page);
    mobileCreatedIds.push(new URL(page.url()).pathname.split("/").at(-1)!);
    await page
      .getByRole("textbox", { name: "页面标题" })
      .fill("Mobile editor done");
    const editor = page.locator('[data-slate-editor="true"]');
    await editor.fill("Mobile done body");
    const canonicalUrl = page.url();
    await page.getByRole("button", { name: "完成" }).click();

    await expect(page).toHaveURL(canonicalUrl);
    await expect(page.getByLabel("页面标题")).toHaveValue("Mobile editor done");
    await expect(editor).toContainText("Mobile done body");
    await expect(editor).not.toBeFocused();
  });
});
