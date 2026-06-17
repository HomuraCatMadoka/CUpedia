import { test, expect, type Page } from "@playwright/test";

/**
 * Sidebar behaviour across viewports.
 *
 * ref #89 — SSR/client hydration mismatch & first-paint flash: the initial
 *   open/collapsed state renders from a cookie on the server, and the expanded
 *   rail/nav is hidden at the mobile breakpoint via CSS (`md:hidden` /
 *   `max-md:hidden`). A fresh mobile load (no cookie) must paint the collapsed
 *   rail immediately — no expand→collapse flash — with no React hydration error.
 * ref #98 — the mobile collapsed rail is trimmed to just the expand toggle; its
 *   duplicate new-page button is kept in the DOM but hidden (`max-md:hidden`),
 *   since the navbar hamburger + drawer already carry that entry. Desktop
 *   collapsed behaviour is unchanged (both controls visible).
 */

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

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

// Sign in via better-auth's REST endpoint; the login form applies a CUHK-domain
// client check that the seed account (@test.com) would fail. The session cookie
// lands in the context jar and is reused by subsequent navigations. better-auth
// rate-limits /sign-in/email per path, so a shared window can return 429 when
// several specs log in — retry with backoff so a transient throttle self-heals.
async function login(page: Page) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (res.ok()) return;
    last = `${res.status()} ${await res.text()}`;
    if (res.status() !== 429) break;
    await page.waitForTimeout(2000);
  }
  expect(false, `login failed: ${last}`).toBe(true);
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

    const response = await page.goto("/wiki", { waitUntil: "networkidle" });
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

    // The expanded sidebar nav must NOT be visible at the mobile breakpoint
    // (it carries `max-md:hidden`). Only the collapsed rail toggle shows.
    const expandedNav = page.locator("nav.max-md\\:hidden");
    await expect(expandedNav).toHaveCount(0);

    // The collapse rail's "展开导航" toggle is the visible affordance.
    await expect(page.getByRole("button", EXPAND)).toBeVisible();
  });

  test("no expand→collapse flash: rail width stays collapsed during settle", async ({
    page,
  }) => {
    await page.goto("/wiki", { waitUntil: "domcontentloaded" });

    // Sample the toggle button's visibility immediately and after hydration
    // settles. A flash would mean the wide nav was momentarily visible.
    const toggle = page.getByRole("button", EXPAND);
    await expect(toggle).toBeVisible();

    const wideNavVisibleEarly = await page
      .locator("nav")
      .filter({ hasText: "Pages" })
      .isVisible()
      .catch(() => false);
    expect(wideNavVisibleEarly).toBe(false);

    await page.waitForLoadState("networkidle");

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
    const response = await page.goto("/wiki/welcome", {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(200);

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
    await page.goto("/wiki", { waitUntil: "networkidle" });

    // Desktop + collapsed cookie => expanded nav must not render at all.
    await expect(page.locator("nav").filter({ hasText: "Pages" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", EXPAND)).toBeVisible();

    const hydrationErrors = errors.filter((e) => HYDRATION_RE.test(e));
    expect(hydrationErrors).toHaveLength(0);
  });
});

test.describe("#98 mobile collapsed rail is trimmed", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });

  // Sign in as the seeded admin so `canEdit` is true and the new-page button is
  // actually emitted — otherwise both the mobile (hidden) and desktop (visible)
  // assertions would pass vacuously.
  test("expand toggle stays; redundant new-page button is in DOM but hidden", async ({
    page,
  }) => {
    await login(page);

    const response = await page.goto("/wiki", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    // The single rail affordance remains visible.
    await expect(page.getByRole("button", EXPAND)).toBeVisible();

    // As an admin editor the new-page entry is emitted into the rail markup
    // (attribute locator counts `display:none` nodes the a11y-tree role query
    // would drop), but `max-md:hidden` must keep it off the mobile viewport —
    // no duplicate of the navbar/drawer entry. The role query, which mirrors
    // what an assistive tech / sighted user perceives, therefore sees none.
    await expect(page.locator('a[href="/wiki/new"]')).toHaveCount(1);
    await expect(page.locator('a[href="/wiki/new"]')).toBeHidden();
    await expect(page.getByRole("link", NEW_PAGE)).toHaveCount(0);
  });
});

test.describe("#98 desktop collapsed rail is unchanged", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("collapsed rail keeps both the expand toggle and the new-page entry", async ({
    page,
    context,
    baseURL,
  }) => {
    await login(page);
    await context.addCookies([
      { name: "wiki-sidebar-collapsed", value: "collapsed", url: baseURL! },
    ]);

    await page.goto("/wiki", { waitUntil: "networkidle" });

    // Desktop collapsed behaviour is preserved: the rail's expand toggle shows.
    await expect(page.getByRole("button", EXPAND)).toBeVisible();

    // The `max-md:hidden` guard only suppresses the new-page entry on mobile,
    // so on desktop it must stay visible.
    const newPage = page.getByRole("link", NEW_PAGE);
    await expect(newPage).toHaveCount(1);
    await expect(newPage).toBeVisible();
  });
});
