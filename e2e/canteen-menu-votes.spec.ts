import { test, expect, type Page } from "@playwright/test";
import { CANTEEN_IDS } from "../scripts/seed-data";
import { loginWithPassword } from "./helpers/auth";

/** ref #193 — canteen menu voting core path (ADR 0007 feature naming) */

const USER_EMAIL = "user@test.com";
const USER_PASSWORD = "password123";
const DEMO_CANTEEN_URL = `/canteen/${CANTEEN_IDS.demo}`;

async function selectLunch(page: Page) {
  const lunchTab = page.getByRole("tab", { name: "午餐" });
  await lunchTab.click();
  await expect(lunchTab).toHaveAttribute("aria-selected", "true");
}

test.describe("canteen menu votes", () => {
  test("homepage canteen card navigates to browse page", async ({ page }) => {
    await page.goto("/");
    // Prefer the home module card (山城食记); nav also has「食堂测评」now.
    await page.getByRole("link", { name: /山城食记/ }).click();
    await expect(page).toHaveURL(/\/canteen$/);
    await expect(page.getByText("演示食堂")).toBeVisible();
  });

  test("anonymous diner can like a dish and see persisted state", async ({
    page,
  }) => {
    // Layout issues anon session cookie; warm it before voting.
    await page.goto("/canteen");
    await page.goto(DEMO_CANTEEN_URL);
    await selectLunch(page);

    const row = page.getByRole("listitem").filter({ hasText: "演示米饭" });
    const likeBtn = row.getByRole("button", { name: "点赞" });
    await likeBtn.click();
    await expect(likeBtn).toHaveAttribute("aria-pressed", "true");
    await expect(likeBtn.getByText("1", { exact: true })).toBeVisible();

    await page.reload();
    await selectLunch(page);
    const likeAfterReload = page
      .getByRole("listitem")
      .filter({ hasText: "演示米饭" })
      .getByRole("button", { name: "点赞" });
    await expect(likeAfterReload).toHaveAttribute("aria-pressed", "true");
  });

  test("menu list renders category svg icons", async ({ page }) => {
    await page.goto(DEMO_CANTEEN_URL);
    await selectLunch(page);
    await expect(page.locator('[data-svg-key="rice"]').first()).toBeVisible();
    await expect(page.locator('[data-svg-key="bowl"]').first()).toBeVisible();
  });

  test("logged-in diner can change vote from like to dislike", async ({
    page,
  }) => {
    await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(DEMO_CANTEEN_URL);
    await selectLunch(page);

    const row = page.getByRole("listitem").filter({ hasText: "演示煲汤" });
    const likeBtn = row.getByRole("button", { name: "点赞" });
    const dislikeBtn = row.getByRole("button", { name: "点踩" });

    await likeBtn.click();
    await expect(likeBtn).toHaveAttribute("aria-pressed", "true");
    await dislikeBtn.click();
    await expect(dislikeBtn).toHaveAttribute("aria-pressed", "true");
    await expect(likeBtn).toHaveAttribute("aria-pressed", "false");
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("lunch menu vote controls are tappable", async ({ page }) => {
      await page.goto(DEMO_CANTEEN_URL);
      await selectLunch(page);

      const row = page.getByRole("listitem").filter({ hasText: "演示米饭" });
      const likeBtn = row.getByRole("button", { name: "点赞" });
      await expect(likeBtn).toBeVisible();
      await likeBtn.click();
      await expect(likeBtn).toHaveAttribute("aria-pressed", "true");
    });
  });
});
