import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

async function emulateTopSafeArea(page: Page) {
  await page.addStyleTag({
    content: ":root { --safe-area-top: 40px !important; }",
  });
}

async function expectBelowHeader(page: Page, surface: Locator, gap: number) {
  const header = page.getByTestId("global-header");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const headerBox = await header.boundingBox();
  const surfaceBox = await surface.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(surfaceBox).not.toBeNull();
  expect(
    surfaceBox!.y - (headerBox!.y + headerBox!.height),
  ).toBeGreaterThanOrEqual(gap);
}

test.describe("#651 safe-area-aware Header sticky consumers", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("product update checklist preserves its desktop Header gap", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/product-updates");
    await emulateTopSafeArea(page);

    const checklist = page.locator("aside").filter({
      has: page.getByRole("heading", { name: "发布检查" }),
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await expectBelowHeader(page, checklist, 24);
  });

  test("announcement editor header stays below the global Header", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/announcements");
    await page.getByRole("button", { name: "新建公告" }).click();
    await emulateTopSafeArea(page);

    const editorHeader = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "新建公告" }) })
      .locator("header");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await expectBelowHeader(page, editorHeader, 0);
  });
});
