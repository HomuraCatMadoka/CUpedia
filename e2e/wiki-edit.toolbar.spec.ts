import { test, expect, type Page } from "@playwright/test";

/**
 * Edit-page persistent formatting toolbar.
 *
 * ref #203 — before the fix the editor exposed no always-on format controls:
 * the only toolbar (`FloatingToolbarKit`) surfaced on text selection, so a
 * freshly opened editor was a blank contenteditable with zero visible entry
 * points. `FixedToolbarKit` renders a sticky toolbar via `beforeEditable`, so
 * bold/turn-into/list/link/table controls are present the moment the page
 * loads — without removing the floating toolbar.
 *
 * ref #206 — the sticky toolbar renders those controls during SSR/first paint,
 * which surfaced a latent bug in `withTooltip`: it wrapped each control in a
 * base-ui tooltip trigger (a second <button>) and mixed a radix Tooltip portal
 * under a base-ui Tooltip root. That produced button-in-button markup plus an
 * uncaught `TooltipPortal must be used within Tooltip`, hard-throwing the whole
 * editor page into an error boundary. The fix merges the tooltip trigger onto
 * the control (`render=`) and unifies the tooltip on base-ui, so the toolbar
 * mounts with valid, non-nested markup.
 *
 * ref #202 (SSR 水合) — the always-on toolbar makes the editor page's first
 * paint heavier, which turned a pre-existing, app-wide hydration mismatch into
 * a hard failure: the `Navbar` renders its auth menu from `useSession()`, whose
 * cookie-backed snapshot lets the first client render already know the user
 * while the server rendered the logged-out link. React #418 then regenerates
 * the whole layout on hydrate, and on a slow first paint that regeneration
 * lands as the user clicks 保存 — detaching the button before its handler runs,
 * so create silently never saved (a flaky create→redirect timeout in CI). The
 * `Navbar` now gates its auth branch on mount, so SSR and the first client
 * render agree and the mismatch cannot occur.
 */

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";
const RICH_SLUG = "rich-content-demo";

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

test.describe("#203 edit-page fixed toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("a persistent format toolbar is visible on load, before any selection", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${RICH_SLUG}`);

    // Editor mounts.
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    // The always-on toolbar is present without clicking or selecting anything.
    const toolbar = page.getByTestId("fixed-toolbar-buttons");
    await expect(toolbar).toBeVisible();

    // It carries a batch of format controls (turn-into, marks, lists, link,
    // table, …), not an empty shell.
    expect(await toolbar.getByRole("button").count()).toBeGreaterThanOrEqual(4);

    // The turn-into control reflects the default block type ("Text") for a
    // paragraph — proof the toolbar is wired to the editor, not inert markup.
    await expect(toolbar.getByText("Text", { exact: true })).toBeVisible();
  });

  test("toolbar controls render as valid, non-nested buttons (no button-in-button)", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${RICH_SLUG}`);

    // The editor must be alive — a hard hydration throw would have replaced the
    // whole page with the "This page couldn't load" error boundary.
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();
    await expect(page.getByTestId("fixed-toolbar-buttons")).toBeVisible();

    // #206 regression: no control may render a <button> nested inside another
    // <button>. That invalid markup is what threw on hydration once the sticky
    // toolbar forced these controls into the first paint. This is a static,
    // post-hydration structural check — the interactive dropdown-open path is
    // covered by the Chrome DevTools pass, which is not subject to cold-compile
    // timing races in CI.
    const nestedButtons = await page.locator("button button").count();
    expect(nestedButtons).toBe(0);

    // The dropdown trigger survived the tooltip-trigger merge: it still exposes
    // a working popup control (aria-haspopup) rather than inert markup.
    await expect(
      page
        .getByTestId("fixed-toolbar-buttons")
        .locator('[aria-haspopup="menu"]')
        .first(),
    ).toBeVisible();
  });

  test("the create page hydrates with no auth-state mismatch (ref #202)", async ({
    page,
  }) => {
    // Guard the Navbar SSR-hydration fix. The create page is the heaviest first
    // paint (always-on toolbar + editor), so it is where the `Navbar`
    // auth-state mismatch used to fire React #418 and regenerate the layout on
    // hydrate — the flake that detached the 保存 button mid-save. With the
    // Navbar gating its auth branch on mount, SSR and the first client render
    // agree, so no hydration error must surface.
    const consoleErrors = collectConsoleErrors(page);

    await page.goto("/wiki/new");
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();
    await expect(page.getByTestId("fixed-toolbar-buttons")).toBeVisible();
    // Let hydration settle; #418 surfaces as a page error right after mount.
    await page.waitForTimeout(1500);

    const hydrationErrors = consoleErrors.filter((e) => HYDRATION_RE.test(e));
    expect(
      hydrationErrors,
      `hydration errors on /wiki/new:\n${hydrationErrors.join("\n")}`,
    ).toHaveLength(0);
  });
});
