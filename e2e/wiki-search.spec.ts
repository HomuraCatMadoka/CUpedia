import { test, expect } from "@playwright/test";
import { PAGE_IDS } from "../scripts/seed-data";

/**
 * Issue #92 — server search caches extracted text; results stay correct.
 *
 * Seed "Dining on Campus" has title "Dining on Campus" and body mentioning
 * "canteens". A title query and a content query must each surface that page,
 * and a content match must render a highlighted snippet.
 */
test.describe("#92 wiki search returns correct results", () => {
  test("title query finds the matching page", async ({ page }) => {
    const response = await page.goto("/wiki/search?q=Dining");
    expect(response?.status()).toBe(200);

    const results = page.locator("a.rounded-lg.border");
    const result = results.filter({ hasText: "Dining on Campus" });
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("href", `/wiki/${PAGE_IDS.dining}`);
  });

  test("content query finds the page with a highlighted snippet", async ({
    page,
  }) => {
    await page.goto("/wiki/search?q=canteens");

    const results = page.locator("a.rounded-lg.border");
    const result = results.filter({ hasText: "Dining on Campus" });
    await expect(result).toBeVisible();
    await expect(result.locator("mark")).toBeVisible();
  });

  test("non-matching query yields zero results", async ({ page }) => {
    await page.goto("/wiki/search?q=zzzznomatchzzzz");
    await expect(page.getByText("找到 0 个结果")).toBeVisible();
  });

  test("global search loads on demand and opens a result", async ({ page }) => {
    await page.goto("/wiki");
    await page.getByRole("button", { name: "搜索 (⌘K)" }).click();
    await page.getByPlaceholder("搜索页面...").fill("Dining");

    const result = page.getByRole("option", { name: /Dining on Campus/ });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(`/wiki/${PAGE_IDS.dining}`);
  });
});
