import { expect, test } from "@playwright/test";
import { PAGE_IDS } from "../scripts/seed-data";
import { loginAsAdmin } from "./helpers/auth";

test.describe("UUID canonical wiki routing (ref #447)", () => {
  test("serves existing pages by UUID and rejects a legacy slug", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);
    await expect(page).toHaveURL(new RegExp(`/wiki/${PAGE_IDS.welcome}$`));
    await expect(
      page.getByRole("heading", { name: "Welcome to CUpedia" }),
    ).toBeVisible();

    await page.goto("/wiki/welcome");
    await expect(page).toHaveURL(/\/wiki\/welcome$/);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    await page.goto("/wiki/history/welcome");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("emits UUID links from navigation, search, and page history", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PAGE_IDS.dining}`);

    await expect(
      page.locator(
        `[data-wiki-tree-link][href="/wiki/${PAGE_IDS.campusLife}"]`,
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "面包屑导航" })
        .getByRole("link", { name: "Campus Life" }),
    ).toHaveAttribute("href", `/wiki/${PAGE_IDS.campusLife}`);
    await expect(page.getByRole("link", { name: "历史" })).toHaveAttribute(
      "href",
      `/wiki/history/${PAGE_IDS.dining}`,
    );

    await page.goto("/wiki/search?q=Dining");
    await expect(
      page
        .locator("a.block.rounded-lg.border")
        .filter({ hasText: "Dining on Campus" }),
    ).toHaveAttribute("href", `/wiki/${PAGE_IDS.dining}`);
  });

  test("shares the canonical UUID URL from the editor", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async ({ url }: ShareData) => {
          sessionStorage.setItem("shared-url", url ?? "");
        },
      });
    });
    await loginAsAdmin(page);
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);

    await page.getByRole("button", { name: "分享页面" }).click();

    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("shared-url")))
      .toBe(`${new URL(page.url()).origin}/wiki/${PAGE_IDS.welcome}`);
  });
});
