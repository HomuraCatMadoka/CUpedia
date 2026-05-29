import { test, expect } from "@playwright/test";

test("homepage loads with title and tagline", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "CUpedia" })).toBeVisible();
  await expect(page.getByText("你的中大百科全书")).toBeVisible();
});

test("wiki index loads", async ({ page }) => {
  const response = await page.goto("/wiki");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "CUpedia", level: 1 }),
  ).toBeVisible();
});
