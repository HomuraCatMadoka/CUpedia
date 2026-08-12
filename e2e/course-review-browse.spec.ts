import { test, expect } from "@playwright/test";

import { expectBottomSheetViewportToStayStill } from "./helpers/mobile-bottom-sheet";

test("ignores a whitespace-only course query", async ({ page }) => {
  await page.goto("/courses?q=%20%20");

  await expect(page.getByText(/全部 \d+ 门课程/)).toBeVisible();
  await expect(page.getByRole("link", { name: "清除搜索与筛选" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("searchbox", { name: "搜索课程" })).toHaveValue(
    "",
  );
});

test("mobile filter sheet keeps its heading inside the visual viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 360 });
  await page.goto("/courses");

  await page.getByRole("button", { name: "筛选" }).click();

  const dialogHeading = page.getByRole("heading", { name: "筛选课程" });
  await expect(dialogHeading).toBeAttached();

  const box = await dialogHeading.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
});

test("mobile drawers do not scroll their viewport while opening", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 667 });
  await page.goto("/courses");

  await expectBottomSheetViewportToStayStill(page, {
    triggerName: "全部学科",
    viewportTestId: "mobile-subject-picker-viewport",
    closeName: "关闭学科选择",
  });

  await page.reload();

  await expectBottomSheetViewportToStayStill(page, {
    triggerName: "筛选",
    viewportTestId: "mobile-course-filter-viewport",
    closeName: "关闭课程筛选",
  });
});

test("#266 public browse, search, credits filter, and detail", async ({
  page,
}) => {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "查找课程" })).toBeVisible();

  await page.getByRole("button", { name: "筛选" }).click();
  await page
    .getByRole("group", { name: "学分" })
    .getByRole("button", { name: "3", exact: true })
    .click();
  await page.getByRole("button", { name: "查看课程" }).click();
  await expect(page).toHaveURL(/credits=3/);
  await expect(page.getByRole("link", { name: /CSCI 1130/ })).toBeVisible();

  await page.getByRole("button", { name: "筛选" }).click();
  await page
    .getByRole("group", { name: "学分" })
    .getByRole("button", { name: "2", exact: true })
    .click();
  await page.getByRole("button", { name: "查看课程" }).click();
  await expect(page.getByText("没有符合条件的课程")).toBeVisible();

  await page.getByRole("button", { name: "筛选" }).click();
  await page
    .getByRole("group", { name: "学分" })
    .getByRole("button", { name: "全部", exact: true })
    .click();
  await page.getByRole("button", { name: "查看课程" }).click();
  await expect(page).not.toHaveURL(/credits=/);

  const search = page.getByRole("searchbox", { name: "搜索课程" });
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
