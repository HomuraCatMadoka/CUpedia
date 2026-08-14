import { expect, test } from "@playwright/test";

test.describe("#651 mobile WebKit Header", () => {
  test("touch opens the safe-area menu and restores focus after closing", async ({
    page,
  }) => {
    await page.goto("/campus-bus");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
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

    const trigger = page.getByRole("button", { name: "打开产品菜单" });
    const headerBox = await page.getByTestId("global-header").boundingBox();
    const triggerBox = await trigger.boundingBox();
    expect(headerBox?.height).toBe(76);
    expect((triggerBox?.x ?? 0) + (triggerBox?.width ?? 0)).toBe(370);

    await trigger.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("button", { name: "关闭产品菜单" }),
    ).toBeFocused();
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box
          ? {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
            }
          : null;
      })
      .toEqual({ x: 16, y: 28, width: 354, height: 612 });

    await page.getByRole("button", { name: "关闭产品菜单" }).tap();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.tap();
    await dialog.getByRole("link", { name: "课程测评" }).tap();
    await expect(page).toHaveURL("/courses");
    await expect(dialog).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  });

  test("landscape keeps the Header and product menu inside the visual viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto("/canteen");
    await page.addStyleTag({
      content: `
        :root {
          --safe-area-top: 12px !important;
          --safe-area-right: 18px !important;
          --safe-area-bottom: 10px !important;
          --safe-area-left: 14px !important;
        }
      `,
    });

    const headerBox = await page.getByTestId("global-header").boundingBox();
    const brandBox = await page
      .getByRole("link", { name: "CUpedia" })
      .boundingBox();
    expect(headerBox?.height).toBe(68);
    expect(brandBox?.x).toBe(22);

    await page.getByRole("button", { name: "打开产品菜单" }).tap();
    const dialog = page.getByRole("dialog");
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box
          ? {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
            }
          : null;
      })
      .toEqual({ x: 22, y: 20, width: 619, height: 337 });
  });
});
