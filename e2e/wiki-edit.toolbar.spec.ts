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
 */

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";
const RICH_SLUG = "rich-content-demo";

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
});
