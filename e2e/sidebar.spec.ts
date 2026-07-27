import { test, expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { loginAsAdmin } from "./helpers/auth";
import { PAGE_IDS } from "../scripts/seed-data";
import { wikiPageUrl } from "./helpers/wiki";

/**
 * Sidebar behaviour across viewports.
 *
 * ref #89 — SSR/client hydration mismatch & first-paint flash: the initial
 *   desktop open/collapsed state renders from a cookie on the server. Mobile
 *   CSS must keep both desktop tree variants out of layout with no hydration
 *   error or expand→collapse flash.
 * ref #316 — mobile has one Header-owned entry into an accessible page-tree
 *   Drawer. The old collapsed rail never occupies content width, while desktop
 *   collapse-cookie behaviour remains unchanged.
 * ref #317 — touch intent prefetches once and slow navigation identifies its
 *   pending target without closing the Drawer before the route commits.
 */

const EXPAND = { name: "展开导航" } as const;
const NEW_PAGE = { name: "新建页面" } as const;

const HYDRATION_RE =
  /hydration|did not match|server rendered html|Text content does not match/i;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function longPress(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  const point = {
    clientX: bounds!.x + bounds!.width / 2,
    clientY: bounds!.y + bounds!.height / 2,
  };
  const pointer = {
    ...point,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
  };

  await locator.dispatchEvent("pointerdown", pointer);
}

async function childPageIds(parentId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      "select id from wiki_pages where parent_id = $1",
      [parentId],
    );
    return result.rows.map((row) => row.id);
  } finally {
    await client.end();
  }
}

async function deleteChildPagesExcept(parentId: string, retainedIds: string[]) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "delete from wiki_pages where parent_id = $1 and not (id = any($2::uuid[]))",
      [parentId, retainedIds],
    );
  } finally {
    await client.end();
  }
}

test.describe("#89 sidebar hydration & first-paint (mobile viewport)", () => {
  // Mobile viewport (no full device descriptor — `defaultBrowserType` cannot
  // live in a describe-level `use`).
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });

  test("loads /wiki with no hydration console error and collapsed first paint", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto("/wiki");
    expect(response?.status()).toBe(200);

    // Page rendered.
    await expect(
      page.getByRole("heading", { name: "你的中大百科全书", level: 1 }),
    ).toBeVisible();

    // No hydration mismatch reported.
    const hydrationErrors = errors.filter((e) => HYDRATION_RE.test(e));
    expect(
      hydrationErrors,
      `unexpected hydration errors:\n${hydrationErrors.join("\n")}`,
    ).toHaveLength(0);

    // The persistent page tree remains in the DOM for desktop, but CSS must
    // keep it out of the mobile layout entirely.
    const expandedNav = page.locator("nav").filter({ hasText: "Pages" });
    await expect(expandedNav).toBeHidden();

    // The Header owns the only mobile page-tree affordance.
    await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
    await expect(page.getByRole("button", EXPAND)).toHaveCount(0);
  });

  test("no expand→collapse flash: rail width stays collapsed during settle", async ({
    page,
  }) => {
    await page.goto("/wiki", { waitUntil: "domcontentloaded" });

    // Sample the toggle button's visibility immediately and after hydration
    // settles. A flash would mean the wide nav was momentarily visible.
    const toggle = page.getByRole("button", { name: "打开导航" });
    await expect(toggle).toBeVisible();

    const wideNavVisibleEarly = await page
      .locator("nav")
      .filter({ hasText: "Pages" })
      .isVisible()
      .catch(() => false);
    expect(wideNavVisibleEarly).toBe(false);

    await expect(
      page.getByRole("heading", { name: "你的中大百科全书", level: 1 }),
    ).toBeVisible();

    const wideNavVisibleLate = await page
      .locator("nav")
      .filter({ hasText: "Pages" })
      .isVisible()
      .catch(() => false);
    expect(wideNavVisibleLate).toBe(false);
  });

  test("article page also loads without hydration error on mobile", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    const response = await page.goto(`/wiki/${PAGE_IDS.welcome}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Welcome to CUpedia", level: 1 }),
    ).toBeVisible();

    const hydrationErrors = errors.filter((e) => HYDRATION_RE.test(e));
    expect(hydrationErrors).toHaveLength(0);
  });
});

test.describe("#89 desktop respects collapse cookie on first paint", () => {
  test("collapsed cookie yields collapsed rail with no flash, no hydration error", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "wiki-sidebar-collapsed",
        value: "collapsed",
        url: baseURL!,
      },
    ]);

    const errors = collectConsoleErrors(page);
    await page.goto("/wiki");

    // Desktop + collapsed cookie => expanded nav must not render at all.
    await expect(page.locator("nav").filter({ hasText: "Pages" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", EXPAND)).toBeVisible();

    const hydrationErrors = errors.filter((e) => HYDRATION_RE.test(e));
    expect(hydrationErrors).toHaveLength(0);
  });
});

test.describe("#316 mobile rail is replaced by the Header Drawer", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });

  // Sign in as the seeded admin so `canEdit` is true and the new-page button is
  // actually emitted — otherwise both the mobile (hidden) and desktop (visible)
  // assertions would pass vacuously.
  test("rail stays absent and editors get one visible new-page entry in the Drawer", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const response = await page.goto("/wiki");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("button", EXPAND)).toHaveCount(0);
    const open = page.getByRole("button", { name: "打开导航" });
    await expect(open).toBeVisible();

    await open.click();
    await expect(page.getByRole("button", NEW_PAGE)).toBeVisible();
  });
});

test.describe("#316 accessible mobile Wiki Drawer", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });

  test("opens modally, locks the page, and restores trigger focus on close", async ({
    page,
  }) => {
    await page.goto("/wiki");

    const trigger = page.getByRole("button", { name: "打开导航" });
    await trigger.click();

    const drawer = page.getByRole("dialog", { name: "Wiki 页面" });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭导航" })).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .toBe("hidden");
    await expect
      .poll(() =>
        page
          .locator("main")
          .evaluate(
            (element) => element.closest('[aria-hidden="true"]') !== null,
          ),
      )
      .toBe(true);

    await page.getByRole("button", { name: "关闭导航" }).click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("supports backdrop and Escape dismissal", async ({ page }) => {
    await page.goto("/wiki");
    const trigger = page.getByRole("button", { name: "打开导航" });

    await trigger.click();
    await page.getByTestId("wiki-drawer-backdrop").click({
      position: { x: 380, y: 400 },
    });
    await expect(page.getByRole("dialog", { name: "Wiki 页面" })).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Wiki 页面" })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("uses a long-press page menu for subpages, then closes after navigation", async ({
    page,
  }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "打开导航" }).click();

    const drawer = page.getByRole("dialog", { name: "Wiki 页面" });
    const campusRow = drawer
      .getByRole("treeitem", { name: "Campus Life" })
      .locator(":scope > .wiki-tree-row");

    await expect(campusRow.getByRole("button")).toHaveCount(0);
    await longPress(campusRow);
    const pageActions = page.getByRole("dialog", {
      name: "Campus Life 页面操作",
    });
    await expect(pageActions).toBeVisible();
    await pageActions.getByRole("button", { name: "隐藏子页面" }).click();
    await expect(
      drawer.getByRole("link", { name: "Dining on Campus" }),
    ).toBeHidden();

    await longPress(campusRow);
    await page
      .getByRole("dialog", { name: "Campus Life 页面操作" })
      .getByRole("button", { name: "显示子页面" })
      .click();
    await expect(
      drawer.getByRole("link", { name: "Dining on Campus" }),
    ).toBeVisible();

    await drawer.getByRole("link", { name: "Getting Started" }).click();
    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.gettingStarted));
    await expect(drawer).toBeHidden();
  });
});

test.describe("#317 mobile Wiki navigation feedback", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });

  test("shows delayed target feedback, blocks repeat clicks, then closes", async ({
    page,
  }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "打开导航" }).click();

    const targetRequests: {
      isPrefetch: boolean;
      segmentPrefetch?: string;
    }[] = [];
    await page.route(`**/wiki/${PAGE_IDS.gettingStarted}?*`, async (route) => {
      const headers = await route.request().allHeaders();
      targetRequests.push({
        isPrefetch: headers["next-router-prefetch"] === "1",
        segmentPrefetch: headers["next-router-segment-prefetch"],
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    const drawer = page.getByRole("dialog", { name: "Wiki 页面" });
    const target = drawer.getByRole("link", { name: "Getting Started" });
    await target.click({ noWaitAfter: true });

    await expect(drawer).toBeVisible();
    const pendingTarget = drawer.getByRole("link", {
      name: "Getting Started，正在打开",
    });
    await expect(pendingTarget).toBeVisible();
    await expect(pendingTarget).toHaveAttribute("aria-disabled", "true");
    await expect(
      pendingTarget.getByTestId("wiki-navigation-pending"),
    ).toBeVisible();

    await pendingTarget.click({ force: true, noWaitAfter: true });
    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.gettingStarted));
    await expect(drawer).toBeHidden();
    // Next.js intentionally disables router prefetching in development. Keep
    // the request-level assertion for the production E2E path; the dev-server
    // path still verifies delayed feedback, click blocking, and route commit.
    if (process.env.E2E_SERVER_MODE !== "dev") {
      expect(
        targetRequests.filter(
          (request) => request.segmentPrefetch === "/_tree",
        ),
      ).toHaveLength(1);
    }
    expect(
      targetRequests.filter((request) => !request.isPrefetch),
    ).toHaveLength(1);
  });

  test("fast navigation does not flash pending feedback", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "打开导航" }).click();
    const drawer = page.getByRole("dialog", { name: "Wiki 页面" });
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __wikiPendingSeen?: boolean;
      };
      testWindow.__wikiPendingSeen = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-testid="wiki-navigation-pending"]')) {
          testWindow.__wikiPendingSeen = true;
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    await drawer
      .getByRole("link", { name: "Getting Started" })
      .click({ noWaitAfter: true });
    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.gettingStarted));
    // Development compilation can make an otherwise-fast route cross the
    // 180ms production feedback threshold. Keep the timing assertion on the
    // production E2E path while still verifying the completed navigation here.
    if (process.env.E2E_SERVER_MODE !== "dev") {
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { __wikiPendingSeen?: boolean })
              .__wikiPendingSeen,
        ),
      ).toBe(false);
    }
  });
});

test.describe("#98 desktop collapsed rail is unchanged", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("collapsed rail keeps both the expand toggle and the new-page entry", async ({
    page,
    context,
    baseURL,
  }) => {
    await loginAsAdmin(page);
    await context.addCookies([
      { name: "wiki-sidebar-collapsed", value: "collapsed", url: baseURL! },
    ]);

    await page.goto("/wiki");

    // Desktop collapsed behaviour is preserved: the rail's expand toggle shows.
    await expect(page.getByRole("button", EXPAND)).toBeVisible();

    // The `max-md:hidden` guard only suppresses the new-page entry on mobile,
    // so on desktop it must stay visible.
    const newPage = page.getByRole("button", NEW_PAGE);
    await expect(newPage).toHaveCount(1);
    await expect(newPage).toBeVisible();
  });
});

test.describe("Notion-aligned hierarchical page tree (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("indents each parent-child level by the same step", async ({ page }) => {
    await page.goto(`/wiki/${PAGE_IDS.dining}`);

    const tree = page.getByRole("tree", { name: "Wiki 页面层级" });
    const labelX = (name: string) =>
      tree
        .getByRole("link", { name, exact: true })
        .getByText(name, { exact: true })
        .evaluate((element) => element.getBoundingClientRect().x);

    const rootX = await labelX("Campus Life");
    const childX = await labelX("Dining on Campus");
    const grandchildX = await labelX("United College Canteen");

    expect(childX - rootX).toBeGreaterThanOrEqual(7);
    expect(childX - rootX).toBeLessThanOrEqual(9);
    expect(grandchildX - childX).toBeGreaterThanOrEqual(7);
    expect(grandchildX - childX).toBeLessThanOrEqual(9);
  });

  test("matches Notion page-row geometry, palette, and disclosure treatment", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${PAGE_IDS.dining}`);

    const nav = page.getByRole("navigation", { name: "Wiki 页面树" });
    const tree = page.getByRole("tree", { name: "Wiki 页面层级" });
    const campusRow = tree
      .getByRole("treeitem", { name: "Campus Life" })
      .locator(":scope > .wiki-tree-row");
    const diningRow = tree
      .getByRole("treeitem", { name: "Dining on Campus" })
      .locator(":scope > .wiki-tree-row");
    const campusLink = campusRow.getByRole("link", {
      name: "Campus Life",
      exact: true,
    });
    const diningLink = diningRow.getByRole("link", {
      name: "Dining on Campus",
      exact: true,
    });

    await expect(nav).toHaveCSS("background-color", "rgb(249, 248, 247)");
    await expect(page.getByTestId("wiki-tree-section-label")).toHaveCSS(
      "color",
      "rgb(160, 158, 154)",
    );
    await expect(campusLink).toHaveCSS("color", "rgb(95, 94, 90)");
    await expect(campusLink).toHaveCSS("font-weight", "500");
    await expect(diningLink).toHaveCSS("color", "rgb(44, 44, 43)");
    await expect(diningLink).toHaveCSS("font-weight", "600");
    await expect(diningRow).toHaveCSS("background-color", "rgb(238, 236, 235)");

    const activeBounds = await diningRow.boundingBox();
    expect(activeBounds?.x).toBe(4);
    expect(activeBounds?.width).toBe(251);
    expect(activeBounds?.height).toBe(30);

    const pageIcon = campusRow.getByTestId("wiki-page-icon");
    const disclosure = campusRow.getByTestId("wiki-disclosure-icon");
    await expect(pageIcon).toBeVisible();
    await expect(disclosure).toHaveCSS("opacity", "0");
    await expect(disclosure).toHaveClass(/lucide-chevron-down/);
    await expect(disclosure).toHaveCSS("width", "16px");
    await expect(disclosure).toHaveCSS("height", "16px");
    await expect(disclosure).toHaveCSS("color", "rgb(95, 94, 90)");
    await expect(disclosure).toHaveCSS("transition-duration", "0s");

    const iconBounds = await pageIcon.boundingBox();
    expect(iconBounds?.width).toBe(18);
    expect(iconBounds?.height).toBe(18);

    await campusRow.hover();
    await expect(disclosure).toHaveCSS("opacity", "1");
    await expect(pageIcon).toHaveCSS("opacity", "0");
    await expect(campusRow.getByTestId("wiki-tree-row-actions")).toHaveCSS(
      "opacity",
      "1",
    );

    await campusRow
      .getByRole("button", { name: "折叠 Campus Life", exact: true })
      .click();
    await expect(campusRow.getByTestId("wiki-disclosure-icon")).toHaveClass(
      /lucide-chevron-right/,
    );
    await campusRow
      .getByRole("button", { name: "展开 Campus Life", exact: true })
      .click();
    await expect(campusRow.getByTestId("wiki-disclosure-icon")).toHaveClass(
      /lucide-chevron-down/,
    );
  });

  test("offers real hover actions and carries the parent into a new child page", async ({
    page,
  }) => {
    const retainedChildIds = await childPageIds(PAGE_IDS.campusLife);
    await loginAsAdmin(page);
    try {
      await page.goto(`/wiki/edit/${PAGE_IDS.dining}`);

      const campusRow = page
        .getByRole("tree", { name: "Wiki 页面层级" })
        .getByRole("treeitem", { name: "Campus Life" })
        .locator(":scope > .wiki-tree-row");
      await campusRow.hover();

      const addChild = campusRow.getByRole("button", {
        name: "在 Campus Life 下新建页面",
      });
      const pageMenu = campusRow.getByRole("button", {
        name: "打开 Campus Life 的页面菜单",
      });
      await expect(addChild).toBeVisible();
      await expect(pageMenu).toBeVisible();

      await pageMenu.click();
      await expect(
        page.getByRole("menuitem", { name: "新建子页面" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      await addChild.click();
      await expect(page).toHaveURL(
        /\/wiki\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "页面设置" }).click();
      await expect(page.getByLabel("父页面")).toHaveValue(PAGE_IDS.campusLife);
      await expect(
        page
          .getByRole("dialog", { name: "页面设置" })
          .getByRole("combobox", { name: "父页面" })
          .locator("option:checked"),
      ).toHaveText("Campus Life");
    } finally {
      await deleteChildPagesExcept(PAGE_IDS.campusLife, retainedChildIds);
    }
  });

  test("reveals the current page through collapsed ancestors without overwriting the preference", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/wiki/${PAGE_IDS.campusLife}`);

    const tree = page.getByRole("tree", { name: "Wiki 页面层级" });
    const campus = tree.getByRole("treeitem", { name: "Campus Life" });
    await campus
      .getByRole("button", { name: "折叠 Campus Life", exact: true })
      .click();
    await expect(
      tree.getByRole("link", { name: "Dining on Campus", exact: true }),
    ).toBeHidden();

    const storedPreference = await page.evaluate(() =>
      localStorage.getItem("wiki-sidebar-collapsed"),
    );
    expect(storedPreference).not.toBeNull();

    await page.goto(`/wiki/${PAGE_IDS.dining}`);

    const reopenedTree = page.getByRole("tree", { name: "Wiki 页面层级" });
    await expect(
      reopenedTree.getByRole("link", {
        name: "Dining on Campus",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      reopenedTree.getByRole("treeitem", { name: "Campus Life" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      await page.evaluate(() => localStorage.getItem("wiki-sidebar-collapsed")),
    ).toBe(storedPreference);
    expect(errors.filter((error) => HYDRATION_RE.test(error))).toHaveLength(0);
  });

  test("exposes hierarchy semantics and supports standard tree arrow keys", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PAGE_IDS.dining}`);

    const tree = page.getByRole("tree", { name: "Wiki 页面层级" });
    const campus = tree.getByRole("treeitem", { name: "Campus Life" });
    const dining = tree.getByRole("treeitem", { name: "Dining on Campus" });
    const canteen = tree.getByRole("treeitem", {
      name: "United College Canteen",
    });
    const firstCampusChild = campus
      .locator(":scope > [role=group] > [role=treeitem]")
      .first();

    await expect(campus).toHaveAttribute("aria-level", "1");
    await expect(dining).toHaveAttribute("aria-level", "2");
    await expect(canteen).toHaveAttribute("aria-level", "3");

    await campus.focus();
    await page.keyboard.press("ArrowRight");
    await expect(firstCampusChild).toBeFocused();

    await dining.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(dining).toBeFocused();
    await expect(dining).toHaveAttribute("aria-expanded", "false");
    await expect(canteen).toBeHidden();

    await page.keyboard.press("ArrowRight");
    await expect(dining).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowRight");
    await expect(canteen).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(dining).toBeFocused();
  });
});

// ADR 0010 — the page tree and the on-this-page TOC now coexist as separate
// columns. Previously a read page with headings swapped the tree out for the
// TOC; the tree (hoisted into wiki/layout.tsx) must now stay put beside it.
test.describe("ADR 0010 coexist nav shell (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a read page with headings shows the page tree AND the TOC at once", async ({
    page,
  }) => {
    // `getting-started` seeds a `## Registration` heading, so the TOC renders.
    const response = await page.goto(`/wiki/${PAGE_IDS.gettingStarted}`);
    expect(response?.status()).toBe(200);

    // Left column: the persistent page tree (was hidden by the old swap here).
    await expect(
      page.getByRole("navigation", { name: "Wiki 页面树" }),
    ).toBeVisible();

    // Right column: the per-page table of contents, coexisting with the tree.
    const toc = page.locator("nav").filter({ hasText: "On this page" });
    await expect(toc).toBeVisible();
    await expect(toc.getByRole("link", { name: "Registration" })).toBeVisible();
  });
});
