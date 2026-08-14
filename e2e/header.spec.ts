import { expect, test, type Page } from "@playwright/test";

import { loginWithPassword } from "./helpers/auth";

const MOBILE_HEIGHT = 851;
const MOBILE_WIDTHS = [320, 360, 375, 393, 430];

async function openProductMenu(page: Page) {
  const trigger = page.getByRole("button", { name: "打开产品菜单" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

test.describe("#651 global single-row Header", () => {
  test("brand returns home and Wiki navigation remains Wiki-only", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: MOBILE_HEIGHT });
    await page.goto("/wiki");

    const header = page.getByTestId("global-header");
    await expect(header.getByRole("link", { name: "CUpedia" })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("button", { name: "打开导航" })).toHaveCount(0);
    await page.goto("/courses");
    await expect(page.getByRole("button", { name: "打开导航" })).toHaveCount(0);
  });

  test("product menu uses the registered products on home and non-Wiki pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: MOBILE_HEIGHT });

    for (const route of ["/", "/courses", "/canteen"]) {
      await page.goto(route);
      const { dialog } = await openProductMenu(page);
      const products = dialog.getByRole("navigation", {
        name: "CUpedia 产品",
      });
      await expect(products.getByRole("link")).toHaveCount(6);
      await expect(
        products.getByRole("link", { name: "百科" }),
      ).toHaveAttribute("href", "/wiki");
      await expect(
        products.getByRole("link", { name: /中大校巴.*測試中/ }),
      ).toHaveAttribute("href", "/campus-bus");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });

  test("nested product routes expose exactly one current product", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: MOBILE_HEIGHT });
    await page.goto("/canteen/shit-rank");

    const { dialog } = await openProductMenu(page);
    const currentProducts = dialog.locator('[aria-current="page"]');
    await expect(currentProducts).toHaveCount(1);
    await expect(currentProducts).toHaveText("💩堂榜");
  });

  test("menu traps focus, locks scrolling, and restores focus after every close path", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 600 });
    await page.goto("/courses");
    await page.evaluate(() => window.scrollTo(0, 300));

    let opened = await openProductMenu(page);
    await expect(
      page.getByRole("button", { name: "关闭产品菜单" }),
    ).toBeFocused();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await page.keyboard.press("Escape");
    await expect(opened.dialog).toBeHidden();
    await expect(opened.trigger).toBeFocused();

    opened = await openProductMenu(page);
    await page.getByRole("button", { name: "关闭产品菜单" }).click();
    await expect(opened.dialog).toBeHidden();
    await expect(opened.trigger).toBeFocused();

    opened = await openProductMenu(page);
    await page.locator('[data-slot="dialog-overlay"]').click({
      position: { x: 1, y: 1 },
    });
    await expect(opened.dialog).toBeHidden();
    await expect(opened.trigger).toBeFocused();

    opened = await openProductMenu(page);
    await opened.dialog.getByRole("link", { name: "分院帽" }).click();
    await expect(page).toHaveURL("/college-picker");
    await expect(opened.dialog).toBeHidden();
  });

  test("mobile widths keep one 56px row, 44px actions, and no horizontal overflow", async ({
    page,
  }) => {
    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: MOBILE_HEIGHT });
      await page.goto("/wiki");

      const header = page.getByTestId("global-header");
      expect((await header.boundingBox())?.height).toBe(56);
      await expect(
        page.getByRole("button", { name: "打开产品菜单" }),
      ).toBeVisible();
      await expect(
        header.getByRole("navigation", { name: "产品导航" }),
      ).toBeHidden();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);

      for (const target of [
        page.getByRole("button", { name: "打开导航" }),
        page.getByRole("button", { name: "搜索 (⌘K)" }),
        page.getByRole("link", { name: "登录后可读取通知" }),
        page.getByRole("link", { name: "登录", exact: true }),
        page.getByRole("button", { name: "打开产品菜单" }),
      ]) {
        const box = await target.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("767px and 768px render exactly one responsive Header layout", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 767, height: MOBILE_HEIGHT });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "打开产品菜单" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "产品导航" }),
    ).toBeHidden();

    await page.setViewportSize({ width: 768, height: MOBILE_HEIGHT });
    await expect(
      page.getByRole("button", { name: "打开产品菜单" }),
    ).toBeHidden();
    const desktopProducts = page.getByRole("navigation", { name: "产品导航" });
    await expect(desktopProducts).toBeVisible();
    await expect(desktopProducts.getByRole("link")).toHaveCount(5);
    expect(
      (await page.getByTestId("global-header").boundingBox())?.height,
    ).toBe(56);
  });

  test("desktop navigation becomes interactive after resizing an open mobile menu", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 767, height: MOBILE_HEIGHT });
    await page.goto("/");
    await openProductMenu(page);

    await page.setViewportSize({ width: 768, height: MOBILE_HEIGHT });
    await page
      .getByRole("navigation", { name: "产品导航" })
      .getByRole("link", { name: "课程测评" })
      .click();

    await expect(page).toHaveURL("/courses");
  });

  test("desktop Header and layout offset preserve a nonzero top safe area", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.addStyleTag({
      content: ":root { --safe-area-top: 24px !important; }",
    });

    const header = page.getByTestId("global-header");
    await expect
      .poll(async () => (await header.boundingBox())?.height)
      .toBe(80);
    expect(
      (await header.getByRole("link", { name: "CUpedia" }).boundingBox())?.y,
    ).toBeGreaterThanOrEqual(24);
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue(
          "--navbar-height",
        ),
      ),
    ).toBe("calc(3.5rem + 24px)");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(1024);

    await page.goto("/wiki");
    await page.addStyleTag({
      content: ":root { --safe-area-top: 24px !important; }",
    });
    await expect
      .poll(
        async () =>
          (
            await page
              .getByRole("navigation", { name: "Wiki 页面树" })
              .boundingBox()
          )?.y,
      )
      .toBe(80);
  });

  test("light, dark, system, and reduced motion preserve the product menu", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 393, height: MOBILE_HEIGHT });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const { dialog } = await openProductMenu(page);
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
    ).toBe("none");

    await dialog.getByRole("button", { name: "切换主题" }).click();
    const lightTheme = page.getByRole("menuitemradio", { name: "亮色" });
    await lightTheme.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    const darkTheme = page.getByRole("menuitemradio", { name: "暗色" });
    await expect(darkTheme).toBeVisible();
    await darkTheme.click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const systemTheme = page.getByRole("menuitemradio", { name: "跟随系统" });
    await expect(systemTheme).toBeVisible();
    await systemTheme.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("authenticated controls stay compact and overlays remain exclusive", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: MOBILE_HEIGHT });
    await loginWithPassword(page, "user@test.com", "password123");
    await page.goto("/");

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    const account = page.getByRole("button", { name: "TestUser" });
    const notifications = page.getByRole("button", { name: /^通知/ });
    for (const target of [account, notifications]) {
      await expect(target).toBeVisible();
      await expect
        .poll(async () => (await target.boundingBox())?.width)
        .toBeGreaterThanOrEqual(44);
      await expect
        .poll(async () => (await target.boundingBox())?.height)
        .toBeGreaterThanOrEqual(44);
    }

    await account.click();
    const myReviews = page.getByRole("menuitem", { name: "我的测评" });
    await expect(myReviews).toBeVisible();
    await page.getByRole("button", { name: "打开产品菜单" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(myReviews).toBeHidden();
    await page.keyboard.press("Escape");

    await notifications.click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible();
    await page.getByRole("button", { name: "打开产品菜单" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(popover).toBeHidden();
  });

  test("desktop account slot keeps the same geometry across auth states", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const guestBox = await page.getByTestId("account-slot").boundingBox();
    expect(guestBox?.width).toBe(160);

    await loginWithPassword(page, "user@test.com", "password123");
    await page.goto("/");

    const signedInBox = await page.getByTestId("account-slot").boundingBox();
    expect(signedInBox?.width).toBe(guestBox?.width);
    expect(signedInBox?.x).toBe(guestBox?.x);
  });
});
