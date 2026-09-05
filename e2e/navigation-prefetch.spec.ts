import { expect, test, type Page } from "@playwright/test";

function trackPrefetch(page: Page) {
  const paths: string[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    if (
      headers["next-router-prefetch"] ||
      headers["next-router-segment-prefetch"]
    ) {
      paths.push(new URL(request.url()).pathname);
    }
  });
  return paths;
}

async function expectIdleWithoutPrefetch(
  page: Page,
  paths: string[],
  targetPath?: string,
) {
  // Observe the forbidden network event after the page's UI is ready. A timeout
  // is the expected result of this negative assertion, not a readiness signal.
  await expect(
    page.waitForRequest(
      (request) => {
        const headers = request.headers();
        return Boolean(
          (headers["next-router-prefetch"] ||
            headers["next-router-segment-prefetch"]) &&
          (!targetPath || new URL(request.url()).pathname === targetPath),
        );
      },
      { timeout: 3_000 },
    ),
  ).rejects.toThrow(/Timeout/);
  expect(paths.filter((path) => !targetPath || path === targetPath)).toEqual(
    [],
  );
}

test.describe("#875 navigation only requests pages on intent", () => {
  test.beforeEach(() => {
    expect(
      process.env.E2E_SERVER_MODE,
      "Prefetch regression coverage requires a production build",
    ).not.toBe("dev");
  });

  test("desktop catalogue stays idle and explicit professor navigation works", async ({
    page,
  }) => {
    const paths = trackPrefetch(page);
    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "查找课程" })).toBeVisible();
    await expectIdleWithoutPrefetch(page, paths);

    await page
      .getByRole("navigation", { name: "课程测评目录" })
      .getByRole("link", { name: "教授", exact: true })
      .click();
    await expect(page).toHaveURL(/\/professors$/);
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
