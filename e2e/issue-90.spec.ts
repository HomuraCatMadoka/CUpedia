import { test, expect } from "@playwright/test";

/**
 * Issue #90 — wiki homepage hides empty (0-篇) category cards.
 *
 * Seed top-level pages: "Welcome to CUpedia" and "Getting Started" have no
 * children; "Campus Life" has one child ("Dining on Campus"). The homepage
 * must render only non-empty categories, so no "0 篇" card may appear and the
 * empty categories' titles must be absent from the 分类 grid.
 */
test.describe("#90 homepage filters empty categories", () => {
  test("no '0 篇' category card is rendered", async ({ page }) => {
    const response = await page.goto("/wiki", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "CUpedia", level: 1 }),
    ).toBeVisible();

    // Scope to the 分类 grid (the grid div immediately following the heading).
    const grid = page.locator("h2", { hasText: "分类" }).locator("+ div");
    await expect(grid).toBeVisible();

    // No empty-count badge anywhere on the page.
    await expect(page.getByText("0 篇")).toHaveCount(0);

    // The seed's non-empty category is shown with its count.
    await expect(grid.getByRole("link", { name: /Campus Life/ })).toBeVisible();
    await expect(grid.getByText("1 篇")).toBeVisible();

    // The seed's empty categories are NOT shown as cards in the grid.
    await expect(
      grid.getByRole("link", { name: /Getting Started/ }),
    ).toHaveCount(0);
    await expect(
      grid.getByRole("link", { name: /Welcome to CUpedia/ }),
    ).toHaveCount(0);
  });
});
