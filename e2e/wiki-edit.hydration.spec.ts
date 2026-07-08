import { test, expect, type Page } from "@playwright/test";

/**
 * Edit-page SSR/CSR hydration stability.
 *
 * ref #204 — the `"use client"` editor renders during SSR *and* re-creates on
 * hydration. Before the fix each pass backfilled its own random nanoid node
 * ids, so the table cells' `data-table-cell-id` disagreed across the boundary
 * (a hydration mismatch that could crash the editor into its error boundary).
 * `normalizeInitialValue` (platejs `normalizeStaticValue`) now stamps
 * deterministic `static-NNNN` ids on both sides.
 *
 * React only logs the mismatch *warning* in dev, and the e2e server runs a
 * production build — so we assert the durable invariant instead: every rendered
 * table cell carries a deterministic `static-` id (never a random nanoid), and
 * the editor mounts without the error boundary.
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

test.describe("#204 edit-page hydration", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("table cells render with deterministic static ids, editor does not crash", async ({
    page,
  }) => {
    await page.goto(`/wiki/edit/${RICH_SLUG}`);

    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();
    // The rich-content fixture carries a table; its cells are the nodes whose
    // ids mismatched in #204.
    await expect(editor.locator("table")).toBeVisible();

    const cellIds = await page
      .locator("[data-table-cell-id]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-table-cell-id")),
      );
    expect(cellIds.length).toBeGreaterThan(0);
    for (const id of cellIds) {
      expect(id, `cell id "${id}" must be deterministic, not a nanoid`).toMatch(
        /^static-\d+$/,
      );
    }

    // The error boundary swaps the editor for a failure notice; assert it never
    // appeared.
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
  });
});
