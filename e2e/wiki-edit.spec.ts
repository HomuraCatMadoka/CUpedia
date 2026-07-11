import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

/**
 * Wiki editor reliability and conflict handling.
 *
 * ref #94 — autosave debounce, the unsaved-change guards, and Cmd/Ctrl+S.
 * ref #89 — the beforeunload guard test originally lived here as a feature-
 *   detected skip while #89's worktree predated the editor; both guards are now
 *   real and asserted directly (see below).
 * ref #96 — overlapping concurrent edits fall back to a manual merge dialog
 *   instead of discarding the draft.
 *
 * Two distinct unsaved-change guards exist and are each covered once:
 *   1. in-app navigation — `wiki-editor.tsx` intercepts in-app <a> clicks with
 *      `window.confirm("有未保存的修改…")` while `autosave.isDirty`.
 *   2. beforeunload — `use-autosave.ts` attaches a `beforeunload` listener that
 *      calls `preventDefault()` while dirty, so a tab close / reload prompts.
 */

const CONFLICT_SLUG = "campus-life";

/** Focus the editor and type a marker into the first block, then confirm dirty. */
async function typeMarker(page: Page, marker: string) {
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(" " + marker);
  await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });
}

test.describe("#94 editor reliability", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("autosave shows 已保存 after debounce", async ({ page }) => {
    await page.goto("/wiki/edit/welcome");
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    const marker = "autosave-" + Date.now();
    await editor.click();
    await page.keyboard.type(" " + marker);

    // Debounce is 1.5s; allow generous slack for the round-trip save.
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });

    // Reloading the edit route must read the authoritative post-save baseline,
    // not stale-while-revalidate content with an obsolete updatedAt.
    await page.reload();
    await expect(page.locator('[role="textbox"]').first()).toContainText(
      marker,
    );
  });

  test("in-app navigation is guarded while dirty", async ({ page }) => {
    await page.goto("/wiki/edit/campus-life");
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type(" dirty-edit");
    // Immediately dirty; the guard fires on in-app <a> clicks via confirm().
    await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });

    // Click the in-app "CUpedia" home link in the navbar.
    const dialogPromise = page.waitForEvent("dialog");
    const clickPromise = page
      .getByRole("link", { name: "CUpedia" })
      .first()
      .click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain("未保存");
    await dialog.dismiss();
    await clickPromise;
    // Dismissed => still on the edit page.
    await expect(page).toHaveURL(/\/wiki\/edit\//);
  });

  test("Cmd/Ctrl+S triggers a save", async ({ page }) => {
    await page.goto("/wiki/edit/getting-started");
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    const marker = "cmd-s-" + Date.now();
    await editor.click();
    await page.keyboard.type(" " + marker);
    await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });

    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+s`);

    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.locator('[role="textbox"]').first()).toContainText(
      marker,
    );
  });

  test("unsaved changes arm the beforeunload guard", async ({ page }) => {
    await page.goto("/wiki/edit/welcome");
    // Type and wait until dirty so use-autosave has attached its beforeunload
    // listener (it only registers while `isDirty`).
    await typeMarker(page, "beforeunload-" + Date.now());

    const guarded = await page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(guarded).toBe(true);
  });
});

/**
 * A second editor session edits the same page, then the first session edits the
 * same region on its now-stale baseline and saves. Because the changes overlap,
 * the three-way merge cannot auto-resolve, so the manual-resolution dialog
 * (reusing RevisionDiff) must appear — never a bare "refresh and lose your
 * draft" dead-end. "Keep mine" then re-saves against the latest revision.
 */
test.describe("#96 edit conflict merge flow", () => {
  test("overlapping concurrent edit opens the manual resolution dialog", async ({
    browser,
  }) => {
    // Both sessions open the editor on the SAME baseline revision.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/edit/${CONFLICT_SLUG}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${CONFLICT_SLUG}`);

    // Session B commits an overlapping change, advancing the server copy past
    // A's baseline.
    await typeMarker(pageB, "BBB");
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${CONFLICT_SLUG}$`), {
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
    await expect(pageA).toHaveURL(new RegExp(`/wiki/${CONFLICT_SLUG}$`), {
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
