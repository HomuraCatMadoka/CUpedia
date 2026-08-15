import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin, loginWithPassword } from "./helpers/auth";
import { PAGE_IDS } from "../scripts/seed-data";

const MOBILE_HEIGHT = 851;
const MOBILE_CASES = [
  { width: 320, route: "/wiki" },
  { width: 360, route: "/wiki/search" },
  { width: 375, route: `/wiki/history/${PAGE_IDS.history}` },
  { width: 393, route: "/wiki" },
  { width: 430, route: "/wiki/search" },
  { width: 767, route: `/wiki/history/${PAGE_IDS.history}` },
] as const;

async function openWikiNavigation(page: Page) {
  const trigger = page.getByRole("button", { name: "打开 Wiki 目录" });
  await trigger.tap();
  const drawer = page.getByRole("dialog", { name: "Wiki 目录" });
  await expect(drawer).toBeVisible();
  return { drawer, trigger };
}

async function revalidateWiki(page: Page) {
  const response = await page.request.post("/api/internal/revalidate-wiki", {
    headers: { authorization: "Bearer e2e-revalidate-wiki" },
  });
  expect(response.ok()).toBe(true);
}

async function hideAllPublicWikiPages(page: Page) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      "select id from wiki_pages where deleted_at is null",
    );
    const ids = result.rows.map(({ id }) => id);
    if (ids.length > 0) {
      await client.query(
        "update wiki_pages set deleted_at = now() where id = any($1::uuid[])",
        [ids],
      );
    }
    await revalidateWiki(page);
    return ids;
  } finally {
    await client.end();
  }
}

async function restorePublicWikiPages(page: Page, ids: string[]) {
  if (ids.length === 0) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "update wiki_pages set deleted_at = null where id = any($1::uuid[])",
      [ids],
    );
    await revalidateWiki(page);
  } finally {
    await client.end();
  }
}

async function deleteWikiDraft(pageId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from wiki_drafts where id = $1", [pageId]);
  } finally {
    await client.end();
  }
}

test.describe("#652 single-row Wiki Header", () => {
  test("covers every mobile width and switches exactly at 768px", async ({
    page,
  }) => {
    for (const { width, route } of MOBILE_CASES) {
      await page.setViewportSize({ width, height: MOBILE_HEIGHT });
      await page.goto(route);

      const header = page.getByTestId("global-header");
      await expect(header).toBeVisible();
      expect((await header.boundingBox())?.height).toBe(56);
      await expect(
        header.getByRole("link", { name: "CUpedia Wiki" }),
      ).toHaveAttribute("href", "/wiki");
      await expect(
        page.getByRole("button", { name: "打开 Wiki 目录" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "打开产品菜单" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "搜索 Wiki (⌘K)" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);

      for (const control of [
        page.getByRole("button", { name: "打开 Wiki 目录" }),
        page.getByRole("button", { name: "搜索 Wiki (⌘K)" }),
        page.getByRole("link", { name: "登录后可读取通知" }),
        page.getByRole("link", { name: "登录", exact: true }),
      ]) {
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }

    await page.setViewportSize({ width: 768, height: MOBILE_HEIGHT });
    await page.goto("/wiki");
    await expect(
      page.getByRole("button", { name: "打开 Wiki 目录" }),
    ).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "产品导航" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Wiki 页面树" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("global-header").getByRole("link", {
        name: "CUpedia",
      }),
    ).toHaveAttribute("href", "/");
  });

  test("canonical pages and drafts keep the focused editor shell", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: MOBILE_HEIGHT });
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);
    await expect(page.getByTestId("global-header")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Welcome to CUpedia" }),
    ).toBeVisible();

    await loginAsAdmin(page);
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);
    await expect(page.getByTestId("global-header")).toHaveCount(0);
    await expect(
      page.getByRole("banner", { name: "编辑器顶栏" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("banner", { name: "编辑器顶栏" })
        .getByRole("button", { name: "打开导航" }),
    ).toBeVisible();

    await page.goto("/wiki/new?draft=1");
    await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]+\?draft=1$/i);
    const draftPageId = new URL(page.url()).pathname.split("/").at(-1)!;
    try {
      await expect(page.getByTestId("global-header")).toHaveCount(0);
      await expect(
        page.getByRole("banner", { name: "编辑器顶栏" }),
      ).toBeVisible();
    } finally {
      await deleteWikiDraft(draftPageId);
    }
  });
});

test.describe("#652 Wiki navigation surface", () => {
  test.use({
    viewport: { width: 393, height: 520 },
    isMobile: true,
    hasTouch: true,
  });

  test("preserves the tree through the full tree/products return order", async ({
    page,
  }) => {
    await page.goto(`/wiki/history/${PAGE_IDS.history}`);
    await page.evaluate(() =>
      localStorage.setItem("wiki-sidebar-collapsed", "[]"),
    );
    await page.reload();

    const { drawer, trigger } = await openWikiNavigation(page);
    const tree = drawer.getByRole("tree", { name: "Wiki 页面层级" });
    const activePage = tree.getByRole("treeitem", {
      name: "Editing History Demo",
    });
    await expect(activePage).toHaveAttribute("aria-current", "page");
    await expect(
      tree.getByRole("treeitem", { name: "Campus Life" }),
    ).toHaveAttribute("aria-expanded", "true");

    const treeScroller = drawer.getByRole("navigation", {
      name: "Wiki 页面树",
    });
    const scrollTop = await treeScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);

    await drawer.getByRole("button", { name: "探索其他功能" }).click();
    const productDrawer = page.getByRole("dialog", {
      name: "探索 CUpedia",
    });
    const productNavigation = productDrawer.getByRole("navigation", {
      name: "CUpedia 产品",
    });
    await expect(productNavigation).toBeVisible();
    await expect(
      productNavigation.getByRole("link", { name: "百科" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("wiki-drawer-backdrop")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Wiki 目录" })).toBeVisible();
    await expect(treeScroller).toBeVisible();
    expect(await treeScroller.evaluate((element) => element.scrollTop)).toBe(
      scrollTop,
    );
    await expect(activePage).toHaveAttribute("aria-current", "page");
    await expect(
      tree.getByRole("treeitem", { name: "Campus Life" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      drawer.getByRole("button", { name: "探索其他功能" }),
    ).toBeFocused();

    await drawer.getByRole("button", { name: "探索其他功能" }).click();
    await page
      .getByRole("dialog", { name: "探索 CUpedia" })
      .getByRole("button", { name: "返回 Wiki 页面树" })
      .click();
    await expect(
      drawer.getByRole("button", { name: "探索其他功能" }),
    ).toBeFocused();
    await drawer.getByRole("button", { name: "关闭 Wiki 目录" }).click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("coordinates account, notifications, search, and Wiki navigation", async ({
    page,
  }) => {
    await loginWithPassword(page, "user@test.com", "password123");
    await page.goto("/wiki");

    const account = page.getByRole("button", { name: "TestUser" });
    await account.click();
    const accountItem = page.getByRole("menuitem", { name: "我的测评" });
    await expect(accountItem).toBeVisible();
    let opened = await openWikiNavigation(page);
    await expect(accountItem).toBeHidden();

    await opened.drawer.getByRole("button", { name: "搜索 Wiki" }).click();
    await expect(opened.drawer).toBeHidden();
    const searchDialog = page.getByRole("dialog", { name: "搜索百科页面" });
    await expect(searchDialog).toBeVisible();
    await expect(
      searchDialog.getByRole("combobox", { name: "搜索百科页面" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");

    const notifications = page.getByRole("button", { name: /^通知/ });
    await notifications.click();
    const notificationPopover = page.locator('[data-slot="popover-content"]');
    await expect(notificationPopover).toBeVisible();
    opened = await openWikiNavigation(page);
    await expect(notificationPopover).toBeHidden();

    await opened.drawer.getByRole("button", { name: "探索其他功能" }).click();
    await expect(
      page.getByRole("dialog", { name: "探索 CUpedia" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
  });

  test("keeps pending feedback, prevents repeats, and recovers from failure", async ({
    page,
  }) => {
    await page.goto("/wiki");
    let { drawer } = await openWikiNavigation(page);

    let productRequests = 0;
    await page.route("**/courses?*", async (route) => {
      const headers = await route.request().allHeaders();
      if (headers["next-router-prefetch"] === "1") {
        await route.abort("failed");
        return;
      }
      productRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await drawer.getByRole("button", { name: "探索其他功能" }).click();
    const productDrawer = page.getByRole("dialog", {
      name: "探索 CUpedia",
    });
    const courses = productDrawer.getByRole("link", { name: "课程测评" });
    await courses.click({ noWaitAfter: true });
    const pendingProduct = productDrawer.getByRole("link", {
      name: "课程测评，正在打开",
    });
    await expect(pendingProduct).toBeVisible();
    await expect(
      pendingProduct.getByTestId("product-navigation-pending"),
    ).toBeVisible();
    await pendingProduct.click({ force: true, noWaitAfter: true });
    await expect(page).toHaveURL("/courses");
    expect(productRequests).toBe(1);
    await page.unroute("**/courses?*");

    let navigationRequests = 0;
    const failingPagePattern = new RegExp(
      `/wiki/${PAGE_IDS.gettingStarted}(?:\\?.*)?$`,
    );
    await page.route(failingPagePattern, async (route) => {
      const headers = await route.request().allHeaders();
      if (headers["next-router-prefetch"] === "1") {
        await route.abort("failed");
        return;
      }
      navigationRequests += 1;
      await new Promise(() => undefined);
    });
    await page.goto("/wiki");
    ({ drawer } = await openWikiNavigation(page));

    const target = drawer.getByRole("link", { name: "Getting Started" });
    await target.click({ noWaitAfter: true });
    const pendingTarget = drawer.getByRole("link", {
      name: "Getting Started，正在打开",
    });
    await expect(pendingTarget).toBeVisible();
    await expect(pendingTarget).toHaveAttribute("aria-disabled", "true");
    await pendingTarget.click({ force: true, noWaitAfter: true });
    await expect(page.getByText("无法打开页面，请重试")).toBeVisible({
      timeout: 15_000,
    });
    await expect(drawer).toBeVisible();
    await expect(target).not.toHaveAttribute("aria-disabled", "true");
    expect(navigationRequests).toBe(1);
    await drawer.getByRole("button", { name: "探索其他功能" }).click();
    await expect(
      page.getByRole("dialog", { name: "探索 CUpedia" }),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "探索 CUpedia" })
      .getByRole("button", { name: "返回 Wiki 页面树" })
      .click();
    await drawer.getByRole("link", { name: "Rich Content Demo" }).click();
    await expect(page).toHaveURL(`/wiki/${PAGE_IDS.richContent}`);
  });

  test("returns home without stale state and restores Wiki identity on return", async ({
    page,
  }) => {
    await page.goto("/wiki");
    const { drawer } = await openWikiNavigation(page);
    await drawer.getByRole("link", { name: "返回 CUpedia 首页" }).click();
    await expect(page).toHaveURL("/");
    await expect(drawer).toBeHidden();
    await expect(
      page.getByRole("button", { name: "打开产品菜单" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "打开产品菜单" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "百科" }).click();
    await expect(page).toHaveURL("/wiki");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "打开 Wiki 目录" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "打开产品菜单" }),
    ).toHaveCount(0);
  });

  test("shows an explicit empty tree and only offers creation to editors", async ({
    page,
  }) => {
    const hiddenPageIds = await hideAllPublicWikiPages(page);
    try {
      await page.goto("/wiki");
      let opened = await openWikiNavigation(page);
      await expect(opened.drawer.getByText("暂无 Wiki 页面")).toBeVisible();
      await expect(
        opened.drawer.getByRole("button", { name: "新建页面" }),
      ).toHaveCount(0);
      await opened.drawer
        .getByRole("button", { name: "关闭 Wiki 目录" })
        .click();

      await loginAsAdmin(page);
      await page.goto("/wiki");
      opened = await openWikiNavigation(page);
      await expect(opened.drawer.getByText("暂无 Wiki 页面")).toBeVisible();
      await expect(
        opened.drawer.getByRole("button", { name: "新建页面" }),
      ).toBeVisible();
    } finally {
      await restorePublicWikiPages(page, hiddenPageIds);
    }
  });
});
