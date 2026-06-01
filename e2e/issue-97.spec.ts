import { test, expect } from "@playwright/test";

/**
 * Issue #97 — unify brand/title, remove duplicate brand name on the wiki home.
 *
 * The navbar already renders the "CUpedia" brand link. The wiki home page
 * previously repeated it as an H1, so the brand appeared twice. After the fix
 * the brand name renders exactly once on /wiki (the navbar), and the wiki home
 * subtitle matches the landing page tagline.
 */

const BRAND = "CUpedia";
const TAGLINE = "你的中大百科全书";

test("wiki home shows the brand name exactly once", async ({ page }) => {
  const response = await page.goto("/wiki");
  expect(response?.status()).toBe(200);

  const count = await page.getByText(BRAND, { exact: true }).count();
  expect(count).toBe(1);
});

test("wiki home and landing page share the same tagline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(TAGLINE)).toBeVisible();

  await page.goto("/wiki");
  await expect(page.getByText(TAGLINE)).toBeVisible();
});
