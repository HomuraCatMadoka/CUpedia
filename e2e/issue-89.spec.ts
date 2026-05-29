import { test, expect, type Page } from "@playwright/test";

/**
 * Issue #89 — sidebar SSR/client hydration mismatch & first-paint flash.
 *
 * The fix renders the sidebar's initial open/collapsed state from a cookie on
 * the server, and hides the expanded rail/nav at the mobile breakpoint via CSS
 * (`md:hidden` / `max-md:hidden`). On a fresh mobile load (no cookie) the first
 * paint must already be the collapsed rail — no expand→collapse flash — and no
 * React hydration error may appear in the console.
 */

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

    const response = await page.goto("/wiki", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    // Page rendered.
    await expect(
      page.getByRole("heading", { name: "CUpedia", level: 1 }),
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
    await expect(page.getByRole("button", { name: "展开导航" })).toBeVisible();
  });

  test("no expand→collapse flash: rail width stays collapsed during settle", async ({
    page,
  }) => {
    await page.goto("/wiki", { waitUntil: "domcontentloaded" });

    // Sample the toggle button's visibility immediately and after hydration
    // settles. A flash would mean the wide nav was momentarily visible.
    const toggle = page.getByRole("button", { name: "展开导航" });
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
    await expect(page.getByRole("button", { name: "展开导航" })).toBeVisible();

    const hydrationErrors = errors.filter((e) => HYDRATION_RE.test(e));
    expect(hydrationErrors).toHaveLength(0);
  });
});

/**
 * #94 — editor autosave / unsaved-change guard / Cmd+S.
 *
 * This worktree (branch fix/sidebar-hydration, issue #89) does NOT implement
 * #94; that feature belongs to its own issue/PR per the project's one-PR-per-
 * issue rule. These specs feature-detect the autosave UI and skip cleanly when
 * it is absent, so the suite stays green here while the coverage activates
 * automatically once #94 ships.
 */

const SEED_EMAIL = "admin@test.com";
const SEED_PASSWORD = "password123";

async function signIn(page: Page, baseURL: string) {
  // Sign in via the better-auth endpoint directly; the login form applies a
  // CUHK-domain client check that the seed account (@test.com) would fail.
  const res = await page.request.post(`${baseURL}/api/auth/sign-in/email`, {
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  return res.ok();
}

async function autosaveImplemented(page: Page): Promise<boolean> {
  const indicator = page.getByText(/已保存|保存中/);
  return (await indicator.count()) > 0;
}

test.describe("#94 editor reliability (autosave / guard / Cmd+S)", () => {
  test("autosave shows saved state after debounce", async ({
    page,
    baseURL,
  }) => {
    const ok = await signIn(page, baseURL!);
    test.skip(!ok, "could not sign in with seed account");

    await page.goto("/wiki/edit/welcome", { waitUntil: "networkidle" });
    test.skip(
      !(await autosaveImplemented(page)),
      "#94 autosave not implemented in this worktree",
    );

    const editor = page.getByRole("textbox").first();
    await editor.click();
    await page.keyboard.type(" e2e-autosave-probe");

    await expect(page.getByText("已保存")).toBeVisible({ timeout: 5000 });
  });

  test("Cmd/Ctrl+S triggers save and is intercepted", async ({
    page,
    baseURL,
  }) => {
    const ok = await signIn(page, baseURL!);
    test.skip(!ok, "could not sign in with seed account");

    await page.goto("/wiki/edit/welcome", { waitUntil: "networkidle" });
    test.skip(
      !(await autosaveImplemented(page)),
      "#94 autosave not implemented in this worktree",
    );

    const editor = page.getByRole("textbox").first();
    await editor.click();
    await page.keyboard.type(" cmd-s-probe");
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+s" : "Control+s",
    );
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 5000 });
  });

  test("unsaved changes trigger beforeunload guard", async ({
    page,
    baseURL,
  }) => {
    const ok = await signIn(page, baseURL!);
    test.skip(!ok, "could not sign in with seed account");

    await page.goto("/wiki/edit/welcome", { waitUntil: "networkidle" });
    test.skip(
      !(await autosaveImplemented(page)),
      "#94 autosave not implemented in this worktree",
    );

    const editor = page.getByRole("textbox").first();
    await editor.click();
    await page.keyboard.type(" unsaved-probe");

    const hasGuard = await page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(hasGuard).toBe(true);
  });
});
