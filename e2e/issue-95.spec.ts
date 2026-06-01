import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

async function login(page: Page) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (res.ok()) return;
    last = `${res.status()} ${await res.text()}`;
    if (res.status() !== 429) break;
    await page.waitForTimeout(2000);
  }
  expect(false, `login failed: ${last}`).toBe(true);
}

// ── #95: wiki interlinks ([[) autocomplete + backlinks ──────────────────────

test.describe("#95 wiki links", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("typing [[ opens the page picker and inserts an internal link", async ({
    page,
  }) => {
    await page.goto("/wiki/edit/welcome");
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" [[");

    // Combobox popover lists existing pages by title.
    const option = page.getByRole("option", { name: "Getting Started" });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // The inserted node renders as an internal /wiki link.
    await expect(editor.locator('a[href="/wiki/getting-started"]')).toHaveText(
      "Getting Started",
    );

    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
  });

  test("target page shows the backlink from the source", async ({ page }) => {
    await page.goto("/wiki/getting-started", { waitUntil: "networkidle" });
    const backlinks = page.getByRole("region", { name: "反向链接" });
    await expect(backlinks).toBeVisible({ timeout: 10_000 });
    await expect(
      backlinks.getByRole("link", { name: "Welcome to CUpedia" }),
    ).toBeVisible();
  });
});
