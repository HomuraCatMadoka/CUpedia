import { test, expect, type Page } from "@playwright/test";
import { CANTEEN_IDS } from "../scripts/seed-data";

/** ref #193 — canteen menu voting core path (ADR 0007 feature naming) */

const USER_EMAIL = "user@test.com";
const USER_PASSWORD = "password123";
const DEMO_CANTEEN_URL = `/canteen/${CANTEEN_IDS.demo}`;

async function login(page: Page, email: string, password: string) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email, password },
      headers: { Origin: "http://localhost:3100" },
    });
    if (res.ok()) return;
    last = `${res.status()} ${await res.text()}`;
    if (res.status() !== 429) break;
    await page.waitForTimeout(2000);
  }
  expect(false, `login failed: ${last}`).toBe(true);
}

test.describe("canteen menu votes", () => {
  test("homepage canteen card navigates to browse page", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /食堂/ }).click();
    await expect(page).toHaveURL(/\/canteen$/);
    await expect(page.getByText("演示食堂")).toBeVisible();
  });

  test("anonymous diner can like a dish and see persisted state", async ({
    page,
  }) => {
    // Layout issues anon session cookie; warm it before voting.
    await page.goto("/canteen", { waitUntil: "networkidle" });
    await page.goto(DEMO_CANTEEN_URL, { waitUntil: "networkidle" });

    const row = page.getByRole("listitem").filter({ hasText: "演示米饭" });
    const likeBtn = row.getByRole("button", { name: "点赞" });
    await likeBtn.click();
    await expect(likeBtn).toHaveAttribute("aria-pressed", "true");
    await expect(likeBtn.getByText("1", { exact: true })).toBeVisible();

    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    const likeAfterReload = page
      .getByRole("listitem")
      .filter({ hasText: "演示米饭" })
      .getByRole("button", { name: "点赞" });
    await expect(likeAfterReload).toHaveAttribute("aria-pressed", "true");
  });

  test("menu list renders category svg icons", async ({ page }) => {
    await page.goto(DEMO_CANTEEN_URL, { waitUntil: "networkidle" });
    await expect(page.locator('[data-svg-key="rice"]').first()).toBeVisible();
    await expect(page.locator('[data-svg-key="spicy"]').first()).toBeVisible();
  });

  test("logged-in diner can change vote from like to dislike", async ({
    page,
  }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(DEMO_CANTEEN_URL, { waitUntil: "networkidle" });

    const row = page.getByRole("listitem").filter({ hasText: "演示辣味" });
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
      await page.goto(DEMO_CANTEEN_URL, { waitUntil: "networkidle" });

      const row = page.getByRole("listitem").filter({ hasText: "演示米饭" });
      const likeBtn = row.getByRole("button", { name: "点赞" });
      await expect(likeBtn).toBeVisible();
      await likeBtn.click();
      await expect(likeBtn).toHaveAttribute("aria-pressed", "true");
    });
  });
});
