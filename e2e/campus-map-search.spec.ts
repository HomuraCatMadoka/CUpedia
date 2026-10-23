// ref #926: use the real Building directory with the basemap unavailable.
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { emulateColorScheme } from "./helpers/theme";

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`search remains readable and resumable at ${viewport.width}px (#926)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/campus-map/config", (route) =>
      route.fulfill({ json: { configured: false } }),
    );
    await loginAsAdmin(page);
    await page.goto("/campus-map");
    const search = page.getByRole("textbox", {
      name: "搜索建筑或地点",
      exact: true,
    });
    await search.fill("楼");
    const results = page.getByRole("region", { name: "搜索结果", exact: true });
    await expect(results).toBeVisible();
    await expect(search).toHaveAccessibleName("搜索建筑或地点");
    await expect(
      results.getByRole("status", { name: "搜索结果数量" }),
    ).toContainText(/\d+ 个匹配/);
    await expect(
      results.getByText("底图暂不可用，仍可查看搜索结果。"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "设施筛选" }),
    ).toBeHidden();
    if (viewport.width < 768)
      await expect(
        page.getByRole("button", { name: "使用我的位置" }),
      ).toBeHidden();

    const bounds = await results.boundingBox();
    expect(bounds!.x).toBe(viewport.width < 768 ? 12 : 16);
    expect(bounds!.width).toBe(
      viewport.width < 768 ? viewport.width - 24 : 390,
    );
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      viewport.height - 12,
    );
    const longName = results.getByRole("button", {
      name: "崇基学院行政楼 Chung Chi College Administration Building",
      exact: true,
    });
    // Neither the row nor its full English name may be clipped horizontally.
    await expect(longName).toBeVisible();
    expect(
      await longName.evaluate(
        (button) => button.scrollWidth <= button.clientWidth,
      ),
    ).toBe(true);
    expect(
      await longName
        .getByText("Chung Chi College Administration Building", { exact: true })
        .evaluate((text) => text.scrollWidth <= text.clientWidth),
    ).toBe(true);

    await longName.click();
    await expect(
      page.getByRole("heading", { name: "崇基学院行政楼", exact: true }),
    ).toBeVisible();
    await expect(results).toBeHidden();
    await search.click();
    await expect(results).toBeVisible();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("楼");

    const previewCount = await results.locator("[data-search-result]").count();
    await results.getByRole("button", { name: /浏览全部/ }).click();
    expect(
      await results.locator("[data-search-result]").count(),
    ).toBeGreaterThan(previewCount);
    await expect(
      results.locator("[data-search-result]").nth(previewCount),
    ).toBeFocused();
    await results
      .locator("[data-search-result]")
      .last()
      .scrollIntoViewIfNeeded();
    await expect(
      results.locator("[data-search-result]").last(),
    ).toBeInViewport();
    await page.getByRole("button", { name: "清除搜索", exact: true }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await expect(results).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "设施筛选" }),
    ).toBeVisible();

    await emulateColorScheme(page, "dark");
    await search.fill("no-matching-building-".repeat(8));
    await expect(results.getByText(/没有找到/)).toBeVisible();
    expect(
      await results.evaluate((panel) => panel.scrollWidth <= panel.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "修改搜索", exact: true }).click();
    await expect(search).toBeFocused();
    await search.fill("楼");
    await search.press("ArrowDown");
    await expect(results.locator("[data-search-result]").first()).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(search).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(results).toBeHidden();
    await expect(search).toHaveValue("");
    await expect(
      page.getByRole("link", { name: "返回 CUpedia 首页" }),
    ).toBeVisible();
    await search.fill("楼");
    await page.getByRole("button", { name: "关闭搜索", exact: true }).click();
    await expect(results).toBeHidden();
    await expect(search).toHaveValue("");
  });
}
