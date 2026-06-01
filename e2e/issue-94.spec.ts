import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

/**
 * Sign in via better-auth's REST endpoint so we bypass the client-side CUHK
 * email whitelist (seed accounts use @test.com). The session cookie lands in
 * the browser context's jar and is shared with subsequent page navigations.
 */
async function login(page: Page) {
  // better-auth applies a strict per-path rate limit to /sign-in/email; when
  // several specs sign in within the shared window the endpoint returns 429.
  // Retry with backoff so a transient throttle self-heals within the timeout.
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

// ── #89: sidebar SSR/hydration on mobile ──────────────────────────────────

test.describe("#89 sidebar hydration", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("mobile /wiki: no hydration error, sidebar collapsed first paint", async ({
    page,
  }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (/hydrat/i.test(text) || /didn't match/i.test(text)) {
        hydrationErrors.push(text);
      }
    });
    page.on("pageerror", (err) => {
      if (/hydrat/i.test(err.message)) hydrationErrors.push(err.message);
    });

    await page.goto("/wiki", { waitUntil: "networkidle" });

    expect(hydrationErrors, hydrationErrors.join("\n")).toHaveLength(0);

    // Collapsed first paint => the expandable <nav> sidebar must not be
    // rendered on mobile (it returns null in the collapsed state). Its presence
    // would mean the expanded->collapsed flash described in the issue.
    await expect(page.locator("nav:has-text('Pages')")).toHaveCount(0);
  });
});

// ── #94: editor autosave / unsaved guard / Cmd+S ──────────────────────────

test.describe("#94 editor reliability", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("autosave shows 已保存 after debounce", async ({ page }) => {
    await page.goto("/wiki/edit/welcome");
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type(" autosave-" + Date.now());

    // Debounce is 1.5s; allow generous slack for the round-trip save.
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
  });

  test("in-app navigation is guarded while dirty", async ({ page }) => {
    await page.goto("/wiki/edit/campus-life");
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type(" dirty-edit");
    // Immediately dirty; the guard fires on in-app <a> clicks via confirm().
    await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });

    let dialogShown = false;
    page.once("dialog", (dialog) => {
      dialogShown = true;
      expect(dialog.message()).toContain("未保存");
      dialog.dismiss();
    });

    // Click the in-app "CUpedia" home link in the navbar.
    await page.getByRole("link", { name: "CUpedia" }).first().click();
    await page.waitForTimeout(500);
    expect(dialogShown).toBe(true);
    // Dismissed => still on the edit page.
    await expect(page).toHaveURL(/\/wiki\/edit\//);
  });

  test("Cmd/Ctrl+S triggers a save", async ({ page }) => {
    await page.goto("/wiki/edit/getting-started");
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type(" cmd-s-" + Date.now());
    await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });

    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+s`);

    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
  });
});
