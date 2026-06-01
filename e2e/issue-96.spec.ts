import { test, expect, type Page } from "@playwright/test";

/**
 * Issue #96 — edit conflicts fall back to a diff/merge flow instead of
 * discarding the user's draft.
 *
 * A second editor session edits the same page, then the first session edits the
 * same region on its now-stale baseline and saves. Because the changes overlap,
 * the three-way merge cannot auto-resolve, so the manual-resolution dialog
 * (reusing RevisionDiff) must appear — never a bare "refresh and lose your
 * draft" dead-end. "Keep mine" then re-saves against the latest revision.
 */

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";
const SLUG = "campus-life";

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

/** Focus the editor and type a marker into the first block. */
async function typeMarker(page: Page, marker: string) {
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(" " + marker);
  await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });
}

test.describe("#96 edit conflict merge flow", () => {
  test("overlapping concurrent edit opens the manual resolution dialog", async ({
    browser,
  }) => {
    // Both sessions open the editor on the SAME baseline revision.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await login(pageA);
    await pageA.goto(`/wiki/edit/${SLUG}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB);
    await pageB.goto(`/wiki/edit/${SLUG}`);

    // Session B commits an overlapping change, advancing the server copy past
    // A's baseline.
    await typeMarker(pageB, "BBB");
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${SLUG}$`), {
      timeout: 15_000,
    });

    // Session A edits the same region on its now-stale baseline and saves.
    await typeMarker(pageA, "ZZZ");
    await pageA.getByRole("button", { name: "保存" }).click();

    // No silent loss + no bare "refresh" dead-end: the merge dialog shows.
    const dialog = pageA.getByRole("dialog", { name: "编辑冲突" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("我的版本", { exact: true })).toBeVisible();
    await expect(dialog.getByText("服务器最新版本")).toBeVisible();

    // "Keep mine" re-saves against the latest revision and navigates to read.
    await dialog.getByRole("button", { name: "保留我的版本另存" }).click();
    await expect(pageA).toHaveURL(new RegExp(`/wiki/${SLUG}$`), {
      timeout: 15_000,
    });
    await pageA.reload();
    await expect(pageA.getByText(/ZZZ/).first()).toBeVisible({
      timeout: 15_000,
    });

    await ctxA.close();
    await ctxB.close();
  });
});
