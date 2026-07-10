import { test, expect, type Page } from "@playwright/test";

const USER_EMAIL = "user@test.com";
const USER_PASSWORD = "password123";

async function login(page: Page, email: string, password: string) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    if (res.ok()) return;
    last = `${res.status()} ${await res.text()}`;
    if (res.status() !== 429) break;
    await page.waitForTimeout(2000);
  }
  expect(false, `login failed: ${last}`).toBe(true);
}

test.describe("homepage danmaku", () => {
  test("visitor sees danmaku section and cannot post", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: "本月弹幕" })).toBeVisible();
    await expect(page.getByText("登录后即可发送弹幕")).toBeVisible();

    const res = await page.request.post("/api/danmaku", {
      data: { content: "匿名弹幕" },
    });
    expect(res.status()).toBe(401);
  });

  test("logged-in user posts danmaku and sees it on screen", async ({
    page,
  }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/", { waitUntil: "networkidle" });

    const text = `E2E弹幕-${Date.now()}`;
    await page.getByLabel("弹幕内容").fill(text);
    await page.getByRole("button", { name: "发送" }).click();

    await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  });
});
