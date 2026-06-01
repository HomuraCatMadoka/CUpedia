import { test, expect } from "@playwright/test";

/**
 * Issue #92 — server search caches extracted text; results stay correct.
 *
 * Seed "Dining on Campus" has title "Dining on Campus" and body mentioning
 * "canteens". A title query and a content query must each surface that page,
 * and a content match must render a highlighted snippet.
 */
test.describe("#92 wiki search returns correct results", () => {
  test("title query finds the matching page", async ({ page }) => {
    const response = await page.goto("/wiki/search?q=Dining", {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(200);

    const results = page.locator("a.rounded-lg.border");
    const result = results.filter({ hasText: "Dining on Campus" });
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("href", "/wiki/campus-life/dining");
  });

  test("content query finds the page with a highlighted snippet", async ({
    page,
  }) => {
    await page.goto("/wiki/search?q=canteens", { waitUntil: "networkidle" });

    const results = page.locator("a.rounded-lg.border");
    const result = results.filter({ hasText: "Dining on Campus" });
    await expect(result).toBeVisible();
    await expect(result.locator("mark")).toBeVisible();
  });

  test("non-matching query yields zero results", async ({ page }) => {
    await page.goto("/wiki/search?q=zzzznomatchzzzz", {
      waitUntil: "networkidle",
    });
    await expect(page.getByText("找到 0 个结果")).toBeVisible();
  });
});
