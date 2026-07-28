import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { loginAsAdmin } from "./helpers/auth";
import { PAGE_IDS } from "../scripts/seed-data";
import { wikiPageUrl } from "./helpers/wiki";

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

const CONFLICT_PAGE_ID = PAGE_IDS.campusLife;

async function insertPageWithMicrosecondTimestamp() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows: users } = await client.query<{ id: string }>(
      "select id from users where email = $1",
      ["admin@test.com"],
    );
    const admin = users[0];
    if (!admin) throw new Error("Seed admin is missing");

    const content = JSON.stringify([
      { type: "p", children: [{ text: "Imported baseline" }] },
    ]);
    const pageId = randomUUID();
    const { rows: pages } = await client.query<{ id: string; version: number }>(
      `insert into wiki_pages (
        id, title, content, created_by, updated_by, updated_at
      ) values (
        $1, $2, $3, $4, $4,
        date_trunc('milliseconds', clock_timestamp()) + interval '456 microseconds'
      )
      returning id, version`,
      [pageId, "Imported timestamp page", content, admin.id],
    );
    const inserted = pages[0];
    if (!inserted) throw new Error("Page insert failed");
    expect(inserted.version).toBe(1);

    await client.query(
      `insert into wiki_revisions (page_id, title, content, edited_by)
       values ($1, $2, $3, $4)`,
      [inserted.id, "Imported timestamp page", content, admin.id],
    );
    return inserted.id;
  } finally {
    await client.end();
  }
}

async function updatePageAsLegacyDeployment(pageId: string) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const content = JSON.stringify([
      { type: "p", children: [{ text: "Legacy deployment edit" }] },
    ]);
    const { rows } = await client.query<{ version: number }>(
      `update wiki_pages
       set content = $2, updated_at = updated_at + interval '1 second'
       where id = $1
       returning version`,
      [pageId, content],
    );
    const updated = rows[0];
    if (!updated) throw new Error("Legacy page update failed");
    // Pre-version application code moves updated_at but leaves version intact.
    expect(updated.version).toBe(1);
  } finally {
    await client.end();
  }
}

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
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    const marker = "autosave-" + Date.now();
    await editor.click();
    await page.keyboard.type(" " + marker);

    // Debounce is 1.5s; allow generous slack for the round-trip save.
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });

    // Reloading the edit route must read the authoritative post-save baseline,
    // not stale-while-revalidate content with an obsolete version.
    await page.reload();
    await expect(page.locator('[role="textbox"]').first()).toContainText(
      marker,
    );
  });

  test("page with a database microsecond timestamp saves without a false conflict", async ({
    page,
  }) => {
    const pageId = await insertPageWithMicrosecondTimestamp();

    await page.goto(`/wiki/${pageId}`);
    const marker = `first-save-${Date.now()}`;
    await typeMarker(page, marker);
    await page.keyboard.press("Control+s");

    await expect(page).toHaveURL(wikiPageUrl(pageId), {
      timeout: 15_000,
    });
    await expect(page.getByText(new RegExp(marker)).first()).toBeVisible();
  });

  test("a legacy deployment write invalidates the new editor baseline", async ({
    page,
  }) => {
    const pageId = await insertPageWithMicrosecondTimestamp();
    await page.goto(`/wiki/${pageId}`);
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();

    await updatePageAsLegacyDeployment(pageId);
    await typeMarker(page, `new-client-${Date.now()}`);
    await page.keyboard.press("Control+s");

    const dialog = page.getByRole("dialog", { name: "编辑冲突" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText("Legacy deployment edit");
  });

  test("in-app navigation flushes a dirty draft before leaving", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PAGE_IDS.campusLife}`);
    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();

    const marker = `navigation-flush-${Date.now()}`;
    await editor.click();
    await page.keyboard.type(` ${marker}`);
    await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });

    await page
      .getByRole("link", { name: "Welcome to CUpedia", exact: true })
      .click();
    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.welcome));
    await page.goto(`/wiki/${PAGE_IDS.campusLife}`);
    await expect(page.locator('[role="textbox"]').first()).toContainText(
      marker,
    );
  });

  test("Cmd/Ctrl+S triggers a save", async ({ page }) => {
    await page.goto(`/wiki/${PAGE_IDS.gettingStarted}`);
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
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);
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
 * draft" dead-end. The server remains authoritative: the user can copy the
 * local version, then continue from the latest server result.
 */
test.describe("#96 edit conflict merge flow", () => {
  test("overlapping concurrent edit opens the manual resolution dialog", async ({
    browser,
  }) => {
    // Both sessions open the editor on the SAME baseline revision.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${CONFLICT_PAGE_ID}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/${CONFLICT_PAGE_ID}`);

    // Session B commits an overlapping change, advancing the server copy past
    // A's baseline.
    await typeMarker(pageB, "BBB");
    await pageB.keyboard.press("Control+s");
    await expect(pageB).toHaveURL(wikiPageUrl(PAGE_IDS.campusLife), {
      timeout: 15_000,
    });

    // Session A edits the same region on its now-stale baseline and saves.
    await typeMarker(pageA, "ZZZ");
    await pageA.keyboard.press("Control+s");

    // No silent loss + no bare "refresh" dead-end: the merge dialog shows.
    const dialog = pageA.getByRole("dialog", { name: "编辑冲突" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("我的版本", { exact: true })).toBeVisible();
    await expect(dialog.getByText("服务器最新版本")).toBeVisible();

    await expect(
      dialog.getByRole("button", { name: "复制我的内容" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /保留我的版本/ }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "返回编辑最终结果" }).click();
    await expect(dialog).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(pageA.locator('[role="textbox"]').first()).toContainText(
      "BBB",
    );
    await expect(pageA.locator('[role="textbox"]').first()).not.toContainText(
      "ZZZ",
    );

    const finalMarker = `FINAL-${Date.now()}`;
    await typeMarker(pageA, finalMarker);
    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await pageA.reload();
    const finalEditor = pageA.locator('[role="textbox"]').first();
    await expect(finalEditor).toContainText("BBB", { timeout: 15_000 });
    await expect(finalEditor).toContainText(finalMarker, { timeout: 15_000 });
    await expect(finalEditor).not.toContainText("ZZZ");

    await ctxA.close();
    await ctxB.close();
  });
});
