import { test, expect } from "@playwright/test";

test("#266 public browse, search, credits filter, and detail", async ({
  page,
}) => {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "课程测评" })).toBeVisible();

  // Credits is a segmented control ("全部学分" / 0 / 1 / 2 / 3); exact match so
  // "3" doesn't also hit the level control's "3000".
  await page.getByRole("button", { name: "3", exact: true }).click();
  await expect(page).toHaveURL(/credits=3/);
  await expect(page.getByRole("link", { name: /CSCI 1130/ })).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByText("没有符合条件的课程")).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).not.toHaveURL(/credits=/);

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

  await search.fill("does-not-exist");
  await search.press("Enter");
  await expect(page.getByText("没有符合条件的课程")).toBeVisible();
});
