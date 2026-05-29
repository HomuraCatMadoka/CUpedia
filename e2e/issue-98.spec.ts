import { test, expect } from "@playwright/test";

/**
 * Issue #98 — trim the redundant mobile collapsed-sidebar rail.
 *
 * On mobile the navbar already exposes a hamburger that opens the drawer, and
 * the drawer itself carries the new-page entry. The collapsed rail therefore
 * keeps only the expand toggle (the no-JS first-paint affordance, see #89) and
 * hides its duplicate new-page button via `max-md:hidden`. Desktop collapsed
 * behaviour is unchanged: both controls stay visible.
 */

const NEW_PAGE = { name: "新建页面" } as const;
const EXPAND = { name: "展开导航" } as const;

test.describe("#98 mobile collapsed rail is trimmed", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });

  test("expand toggle stays, redundant new-page button is hidden on mobile", async ({
    page,
  }) => {
    const response = await page.goto("/wiki", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    // The single rail affordance remains.
    await expect(page.getByRole("button", EXPAND)).toBeVisible();

    // The new-page button, if present in the DOM, must not be visible on mobile.
    const newPage = page.getByRole("link", NEW_PAGE);
    if ((await newPage.count()) > 0) {
      await expect(newPage.first()).toBeHidden();
    }
  });
});

test.describe("#98 desktop collapsed rail is unchanged", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("collapsed cookie keeps the expand toggle visible; new-page entry is not mobile-hidden", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "wiki-sidebar-collapsed", value: "collapsed", url: baseURL! },
    ]);

    await page.goto("/wiki", { waitUntil: "networkidle" });

    // Desktop collapsed behaviour is preserved: the rail's expand toggle shows.
    await expect(page.getByRole("button", EXPAND)).toBeVisible();

    // The new-page entry renders only for editors; when present it must NOT be
    // hidden on desktop (the `max-md:hidden` guard only suppresses it on mobile).
    const newPage = page.getByRole("link", NEW_PAGE);
    if ((await newPage.count()) > 0) {
      await expect(newPage.first()).toBeVisible();
    }
  });
});
