import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

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
    const response = await page.goto("/wiki/welcome");
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

    // The desktop rail entry remains mounted but is hidden with its parent.
    await expect(page.locator('a[href="/wiki/new"]')).toHaveCount(1);
    await expect(page.locator('a[href="/wiki/new"]')).toBeHidden();

    await open.click();
    await expect(page.getByRole("link", NEW_PAGE)).toBeVisible();
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

  test("keeps tree state and closes after page navigation", async ({
    page,
  }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "打开导航" }).click();

    const drawer = page.getByRole("dialog", { name: "Wiki 页面" });
    const campusRow = drawer
      .getByRole("link", { name: "Campus Life" })
      .locator("..");
    const collapse = campusRow.getByRole("button", { name: "折叠" });
    await collapse.click();
    await expect(
      drawer.getByRole("link", { name: "Dining on Campus" }),
    ).toBeHidden();
    await campusRow.getByRole("button", { name: "展开" }).click();
    await expect(
      drawer.getByRole("link", { name: "Dining on Campus" }),
    ).toBeVisible();

    await drawer.getByRole("link", { name: "Getting Started" }).click();
    await expect(page).toHaveURL(/\/wiki\/getting-started$/);
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
    await page.route("**/wiki/getting-started?*", async (route) => {
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
    await expect(page).toHaveURL(/\/wiki\/getting-started$/);
    await expect(drawer).toBeHidden();
    expect(
      targetRequests.filter((request) => request.segmentPrefetch === "/_tree"),
    ).toHaveLength(1);
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
    await expect(page).toHaveURL(/\/wiki\/getting-started$/);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __wikiPendingSeen?: boolean })
            .__wikiPendingSeen,
      ),
    ).toBe(false);
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
    const newPage = page.getByRole("link", NEW_PAGE);
    await expect(newPage).toHaveCount(1);
    await expect(newPage).toBeVisible();
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
    const response = await page.goto("/wiki/getting-started");
    expect(response?.status()).toBe(200);

    // Left column: the persistent page tree (was hidden by the old swap here).
    await expect(
      page.locator("nav").filter({ hasText: "Pages" }),
    ).toBeVisible();

    // Right column: the per-page table of contents, coexisting with the tree.
    const toc = page.locator("nav").filter({ hasText: "On this page" });
    await expect(toc).toBeVisible();
    await expect(toc.getByRole("link", { name: "Registration" })).toBeVisible();
  });
});
