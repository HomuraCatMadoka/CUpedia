import { test, expect } from "@playwright/test";

test("#266 browse courses by code and title", async ({ page }) => {
  await page.goto("/courses");

  const search = page.getByPlaceholder("搜索课程代码或名称...");
  await search.fill("CSCI1130");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=CSCI1130/);
  await page.getByRole("link", { name: /CSCI 1130/ }).click();
  await expect(page.getByRole("heading", { name: "CSCI 1130" })).toBeVisible();

  await page.getByRole("link", { name: "返回课程列表" }).click();
  await search.fill("Introduction to Computing Using Java");
  await search.press("Enter");
  await expect(page.getByRole("link", { name: /CSCI 1130/ })).toBeVisible();
});
