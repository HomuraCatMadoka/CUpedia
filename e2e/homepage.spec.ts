import { test, expect } from "@playwright/test";

/**
 * Homepage e2e — ref #90 #97
 *
 * #90: wiki homepage hides empty (0-篇) category cards. Seed top-level pages
 *      "Welcome to CUpedia" / "Getting Started" have no children; "Campus Life"
 *      has one ("Dining on Campus"). Only non-empty categories render, so no
 *      "0 篇" card appears and empty categories are absent from the 分类 grid.
 * #97: brand/title unified — the navbar renders the "CUpedia" brand, so the
 *      wiki home must show it exactly once, and the wiki home shares the
 *      landing page tagline.
 */

test.describe("#90 homepage filters empty categories", () => {
  test("no '0 篇' category card is rendered", async ({ page }) => {
    const response = await page.goto("/wiki", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "你的中大百科全书", level: 1 }),
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

const BRAND = "CUpedia";
const TAGLINE = "你的中大百科全书";

test.describe("#97 wiki home brand & tagline", () => {
  test("wiki home shows the brand name exactly once", async ({ page }) => {
    const response = await page.goto("/wiki");
    expect(response?.status()).toBe(200);

    const count = await page.getByText(BRAND, { exact: true }).count();
    expect(count).toBe(1);
  });

  test("wiki home and landing page share the same tagline", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(TAGLINE)).toBeVisible();

    await page.goto("/wiki");
    await expect(page.getByText(TAGLINE)).toBeVisible();
  });
});
