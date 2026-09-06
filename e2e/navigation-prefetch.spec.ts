import { expect, test } from "@playwright/test";
import { expectIdleWithoutPrefetch, trackPrefetch } from "./helpers/prefetch";

test.describe("#875 navigation only requests pages on intent", () => {
  test.beforeEach(() => {
    expect(
      process.env.E2E_SERVER_MODE,
      "Prefetch regression coverage requires a production build",
    ).not.toBe("dev");
  });

  test("desktop catalogue stays idle and explicit product navigation works", async ({
    page,
  }) => {
    const paths = trackPrefetch(page);
    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "查找课程" })).toBeVisible();
    await expectIdleWithoutPrefetch(page, paths);

    // Use a destination backed by global fixtures. The professor suite seeds
    // its own directory later; visiting it here would cache the unseeded data.
    await page
      .getByTestId("global-header")
      .getByRole("link", { name: /CU Bus/ })
      .click();
    await expect(page).toHaveURL(/\/campus-bus$/);
  });

  test("opening the mobile menu does not load its destinations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const paths = trackPrefetch(page);
    await page.goto("/courses");
    await page.getByRole("button", { name: "打开产品菜单" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    await expectIdleWithoutPrefetch(page, paths);

    await menu.getByRole("link", { name: "食堂", exact: true }).click();
    await expect(page).toHaveURL(/\/canteen$/);
    await expect(menu).toBeHidden();
  });

  test("course details do not prefetch tabs and clicking a tab still works", async ({
    page,
  }) => {
    await page.goto("/courses");
    const firstCourse = page.getByTestId("course-card").first();
    const href = await firstCourse.getAttribute("href");
    expect(href).toBeTruthy();
    const coursePath = new URL(href!, "http://localhost").pathname;
    const paths = trackPrefetch(page);
    await firstCourse.click();
    const tabs = page.getByRole("navigation", { name: "课程详情内容" });
    await expect(tabs).toBeVisible();
    await expectIdleWithoutPrefetch(page, paths, coursePath);

    await tabs.getByRole("link", { name: "选课人数参考" }).click();
    await expect(page).toHaveURL(/tab=enrollment/);
    await expect(
      tabs.getByRole("link", { name: "选课人数参考" }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "返回课程列表" }).click();
    await expect(page.getByRole("heading", { name: "查找课程" })).toBeVisible();

    await page.goto(href!);
    await tabs.getByRole("link", { name: "选课人数参考" }).click();
    await expect(page).toHaveURL(/tab=enrollment/);
    await page.getByRole("link", { name: "查看评论", exact: true }).click();
    await expect(page).toHaveURL(/#peer-reviews$/);
    await expect(page.locator("#peer-reviews")).toBeInViewport();
    await page.getByRole("link", { name: "写测评", exact: true }).click();
    await expect(page).toHaveURL(/#course-review$/);
    await expect(page.locator("#course-review")).toBeInViewport();
  });
});
