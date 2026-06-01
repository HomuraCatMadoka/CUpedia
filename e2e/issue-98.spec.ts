import { test, expect, type Page } from "@playwright/test";

/**
 * Issue #98 — trim the redundant mobile collapsed-sidebar rail.
 *
 * On mobile the navbar already exposes a hamburger that opens the drawer, and
 * the drawer itself carries the new-page entry. The collapsed rail therefore
 * keeps only the expand toggle (the no-JS first-paint affordance, see #89) and
 * hides its duplicate new-page button via `max-md:hidden`. Desktop collapsed
 * behaviour is unchanged: both controls stay visible.
 *
 * We sign in as the seeded admin so `canEdit` is true and the new-page button
 * is actually emitted into the DOM — otherwise the mobile assertion (button is
 * hidden) and the desktop assertion (button is visible) would pass vacuously.
 */

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

const EXPAND = { name: "展开导航" } as const;
const NEW_PAGE = { name: "新建页面" } as const;

// Sign in via better-auth's REST endpoint; the login form applies a CUHK-domain
// client check that the seed account (@test.com) would fail. The session cookie
// lands in the context jar and is reused by subsequent navigations.
//
// better-auth applies a strict per-path rate limit to /sign-in/email; when the
// suite logs in across several specs the shared window can return 429. Retry
// with backoff so a transient throttle self-heals within the test timeout.
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

test.describe("#98 mobile collapsed rail is trimmed", () => {
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });

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
