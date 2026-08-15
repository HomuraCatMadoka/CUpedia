import { expect, test } from "@playwright/test";

test.describe("#652 Mobile WebKit Wiki navigation", () => {
  test("real touch preserves safe areas, scroll, products, and focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 500 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/wiki");
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
      localStorage.setItem("wiki-sidebar-collapsed", "[]");
    });
    await page.reload();
    await page.addStyleTag({
      content: `
        :root {
          --safe-area-top: 20px !important;
          --safe-area-right: 12px !important;
          --safe-area-bottom: 16px !important;
          --safe-area-left: 8px !important;
        }
      `,
    });

    const trigger = page.getByRole("button", { name: "打开 Wiki 目录" });
    const headerBox = await page.getByTestId("global-header").boundingBox();
    expect(headerBox?.height).toBe(76);

    await trigger.tap();
    const drawer = page.getByRole("dialog", { name: "Wiki 目录" });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "关闭 Wiki 目录" }),
    ).toBeFocused();
    await expect(drawer).toHaveCSS("transition-property", "none");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(drawer).toHaveCSS("background-color", "rgb(25, 25, 25)");
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox?.y).toBe(0);
    expect(drawerBox?.height).toBe(page.viewportSize()?.height);
    const closeBox = await drawer
      .getByRole("button", { name: "关闭 Wiki 目录" })
      .boundingBox();
    expect(closeBox?.y).toBeGreaterThanOrEqual(20);
    const exploreBox = await drawer
      .getByRole("button", { name: "探索其他功能" })
      .boundingBox();
    expect(
      (exploreBox?.y ?? 0) + (exploreBox?.height ?? 0),
    ).toBeLessThanOrEqual(500 - 16);

    const treeScroller = drawer.getByRole("navigation", {
      name: "Wiki 页面树",
    });
    const scrollTop = await treeScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);

    await drawer.getByRole("button", { name: "探索其他功能" }).tap();
    const productDrawer = page.getByRole("dialog", {
      name: "探索 CUpedia",
    });
    const products = productDrawer.getByRole("navigation", {
      name: "CUpedia 产品",
    });
    await expect(products).toBeVisible();
    await expect(products.getByRole("link")).toHaveCount(6);
    await productDrawer.getByRole("button", { name: "返回 Wiki 页面树" }).tap();
    expect(await treeScroller.evaluate((element) => element.scrollTop)).toBe(
      scrollTop,
    );

    await drawer.getByRole("button", { name: "关闭 Wiki 目录" }).tap();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  });

  test("system theme follows the OS through the complete Wiki flow", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/wiki");
    await page.evaluate(() => localStorage.setItem("theme", "system"));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const trigger = page.getByRole("button", { name: "打开 Wiki 目录" });
    await trigger.tap();
    const treeDrawer = page.getByRole("dialog", { name: "Wiki 目录" });
    await treeDrawer.getByRole("button", { name: "探索其他功能" }).tap();
    const productDrawer = page.getByRole("dialog", {
      name: "探索 CUpedia",
    });
    await expect(productDrawer).toHaveCSS(
      "background-color",
      "rgb(25, 25, 25)",
    );
    await productDrawer.getByRole("button", { name: "返回 Wiki 页面树" }).tap();
    await treeDrawer.getByRole("button", { name: "关闭 Wiki 目录" }).tap();
    await expect(trigger).toBeFocused();

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
