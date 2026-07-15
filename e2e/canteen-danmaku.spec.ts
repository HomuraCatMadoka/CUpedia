import { test, expect, type Page } from "@playwright/test";
import { CANTEEN_IDS } from "../scripts/seed-data";
import { loginWithPassword } from "./helpers/auth";

const USER_EMAIL = "user@test.com";
const USER_PASSWORD = "password123";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";
const BANNED_EMAIL = "banned@test.com";
const SAFE_SUFFIX_CHARS = "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳";

function uniqueDanmakuText(prefix: string) {
  const suffix = Array.from(
    crypto.randomUUID().replaceAll("-", ""),
    (hex) => SAFE_SUFFIX_CHARS[Number.parseInt(hex, 16)],
  ).join("");
  return `${prefix}-${suffix}`;
}

async function submitDanmaku(page: Page, text: string) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/danmaku") &&
      response.request().method() === "POST",
  );

  await page.getByLabel("弹幕内容").fill(text);
  await page.getByRole("button", { name: "发送" }).click();

  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(201);
}

test.describe("canteen danmaku", () => {
  test("visitor sees danmaku section and cannot post", async ({ page }) => {
    await page.goto("/canteen");
    await expect(page.getByRole("region", { name: "本月弹幕" })).toBeVisible();
    await expect(page.getByText("登录后即可发送弹幕")).toBeVisible();

    const res = await page.request.post("/api/danmaku", {
      data: { content: "匿名弹幕" },
    });
    expect(res.status()).toBe(401);
  });

  test("logged-in user posts danmaku and sees it in flyover layer", async ({
    page,
  }) => {
    await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/canteen");

    const text = uniqueDanmakuText("E2E弹幕");
    await submitDanmaku(page, text);

    const flyover = page.locator(".danmaku-track-layer .danmaku-item", {
      hasText: text,
    });
    await expect(flyover).toBeVisible({ timeout: 10_000 });
  });

  test("reduced-motion shows static list instead of flyover", async ({
    page,
  }) => {
    await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/canteen");

    const text = uniqueDanmakuText("E2E静态");
    await submitDanmaku(page, text);

    const staticList = page.getByRole("list", {
      name: "弹幕列表（减少动画模式）",
    });
    await expect(staticList).toBeVisible();
    await expect(staticList.getByText(text)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".danmaku-track-layer")).toBeHidden();
  });

  test("banned user cannot post danmaku", async ({ page }) => {
    await loginWithPassword(page, BANNED_EMAIL, USER_PASSWORD);
    await page.goto("/canteen");
    await expect(page.getByText("账号已封禁，无法发送弹幕")).toBeVisible();

    const res = await page.request.post("/api/danmaku", {
      data: { content: "封禁用户弹幕" },
    });
    expect(res.status()).toBe(403);
  });

  test("admin can delete danmaku from admin panel", async ({ page }) => {
    await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
    const text = uniqueDanmakuText("E2E删除");
    const post = await page.request.post("/api/danmaku", {
      data: { content: text },
    });
    expect(post.status()).toBe(201);

    await page.context().clearCookies();
    await loginWithPassword(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/danmaku");
    await expect(page.getByText(text)).toBeVisible();

    const row = page.locator("li").filter({ hasText: text });
    await row.getByRole("button", { name: "删除" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "删除" })
      .click();
    await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  });

  test.use({ viewport: { width: 375, height: 800 } });

  test("mobile flyover does not block canteen card clicks", async ({
    page,
  }) => {
    await page.goto("/canteen");
    const canteenCard = page.getByRole("link", { name: /演示食堂/ });
    await expect(canteenCard).toBeVisible();
    await canteenCard.click();
    await expect(page).toHaveURL(new RegExp(`/canteen/${CANTEEN_IDS.demo}`));
  });
});
