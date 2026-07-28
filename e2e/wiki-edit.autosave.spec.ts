import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { loginAsAdmin } from "./helpers/auth";
import {
  createUntitledWikiPage,
  waitForHydratedWikiEditor,
  wikiPageUrl,
} from "./helpers/wiki";

const FIXTURE_CONTENT = JSON.stringify([
  { type: "p", children: [{ text: "Alpha block." }] },
  { type: "p", children: [{ text: "Beta block." }] },
  { type: "p", children: [{ text: "Gamma block." }] },
]);
const FIXTURES = {
  merge: {
    id: randomUUID(),
    title: "Autosave merge fixture",
  },
  explicit: {
    id: randomUUID(),
    title: "Autosave explicit fixture",
  },
  failure: {
    id: randomUUID(),
    title: "Autosave failure fixture",
  },
  passiveConflict: {
    id: randomUUID(),
    title: "Autosave passive conflict fixture",
  },
  bodyTitleMerge: {
    id: randomUUID(),
    title: "Autosave body title fixture",
  },
  titleConflict: {
    id: randomUUID(),
    title: "Autosave title conflict fixture",
  },
  urlIdentity: {
    id: randomUUID(),
    title: "Autosave UUID fixture",
  },
} as const;
const MERGE_ID = FIXTURES.merge.id;

test.beforeAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      "select id from users where email = $1",
      ["admin@test.com"],
    );
    const adminId = result.rows[0]?.id;
    if (!adminId) throw new Error("seed admin is missing");

    for (const fixture of Object.values(FIXTURES)) {
      await client.query(
        `insert into wiki_pages
           (id, title, content, created_by, updated_by, version)
         values ($1, $2, $3, $4, $4, 1)`,
        [fixture.id, fixture.title, FIXTURE_CONTENT, adminId],
      );
    }
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from wiki_pages where id = any($1::uuid[])", [
      Object.values(FIXTURES).map((fixture) => fixture.id),
    ]);
  } finally {
    await client.end();
  }
});

async function appendAfterText(page: Page, anchor: string, marker: string) {
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible();

  const text = editor
    .locator('[data-slate-node="text"]')
    .filter({ hasText: anchor })
    .first();
  await expect(text).toBeVisible();
  await text.click();
  await page.keyboard.press("End");
  await page.keyboard.type(` ${marker}`);

  await expect(editor).toContainText(marker);
  await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
    "data-autosave-status",
    "unsaved",
  );
}

test.describe("#432 latest draft convergence", () => {
  test("a newly created page autosaves before navigation", async ({ page }) => {
    await loginAsAdmin(page);

    await createUntitledWikiPage(page);
    await waitForHydratedWikiEditor(page);
    await page.getByLabel("标题").fill(`Guarded draft ${Date.now()}`);

    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "CUpedia" }).first().click();
    await expect(page).toHaveURL(/\/wiki$/);
  });

  test("a title-only edit is autosaved and survives a fresh edit read", async ({
    page,
  }) => {
    const title = `Autosaved title ${Date.now()}`;

    await loginAsAdmin(page);
    await page.goto(`/wiki/${MERGE_ID}`);
    await waitForHydratedWikiEditor(page);

    await page.getByLabel("标题").fill(title);
    await expect(page.getByText("未保存")).toBeVisible();
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status", { name: "保存状态" })).toHaveText(
      "已保存",
    );
    await expect(
      page.getByRole("button", { name: "完成", exact: true }),
    ).toBeHidden();

    await page.goto(`/wiki/${MERGE_ID}`);
    await expect(page.getByLabel("标题")).toHaveValue(title);
  });

  test("page settings no longer expose a mutable URL path", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/wiki/${FIXTURES.urlIdentity.id}`);

    await page.getByRole("button", { name: "页面设置" }).click();
    const settingsDialog = page.getByRole("dialog", { name: "页面设置" });
    await expect(
      settingsDialog.getByRole("textbox", { name: "URL 路径" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(settingsDialog).toHaveCount(0);

    await expect(page).toHaveURL(wikiPageUrl(FIXTURES.urlIdentity.id));
    await expect(page.locator('a[aria-label="返回 Wiki"]')).toHaveAttribute(
      "href",
      `/wiki/${FIXTURES.urlIdentity.id}`,
    );

    await page.reload();
    await expect(page.getByLabel("标题")).toHaveValue(
      FIXTURES.urlIdentity.title,
    );

    await page.goto(`/wiki/${FIXTURES.urlIdentity.id}`);
    await expect(page).toHaveURL(wikiPageUrl(FIXTURES.urlIdentity.id));
    await page.goto(`/wiki/${FIXTURES.urlIdentity.id}`);
    await expect(page).toHaveURL(wikiPageUrl(FIXTURES.urlIdentity.id));
  });

  test("explicit save persists input typed while its request is in flight", async ({
    page,
  }) => {
    const firstTitle = `First save title ${Date.now()}`;
    const trailingTitle = `Trailing title ${Date.now()}`;

    await loginAsAdmin(page);

    let releaseFirstResponse!: () => void;
    const firstResponseGate = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve;
    });
    let markFirstResponseHeld!: () => void;
    const firstResponseHeld = new Promise<void>((resolve) => {
      markFirstResponseHeld = resolve;
    });
    let held = false;

    await page.route(`**/wiki/${FIXTURES.explicit.id}`, async (route) => {
      if (route.request().method() === "POST" && !held) {
        held = true;
        const response = await route.fetch();
        markFirstResponseHeld();
        await firstResponseGate;
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });

    await page.goto(`/wiki/${FIXTURES.explicit.id}`);
    await waitForHydratedWikiEditor(page);
    await page.getByLabel("标题").fill(firstTitle);
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "unsaved",
    );
    await page.keyboard.press("Control+s");
    await firstResponseHeld;
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saving",
    );

    await page.getByLabel("标题").fill(trailingTitle);

    releaseFirstResponse();

    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await page.goto(`/wiki/${FIXTURES.explicit.id}`);
    await expect(page.getByLabel("标题")).toHaveValue(trailingTitle);
  });

  test("a failed explicit save keeps the draft open with retryable feedback", async ({
    page,
  }) => {
    const draftTitle = `Offline draft ${Date.now()}`;
    const editPath = `/wiki/${FIXTURES.failure.id}`;

    await loginAsAdmin(page);
    await page.route(`**${editPath}`, async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    await page.getByLabel("标题").fill(draftTitle);
    await page.keyboard.press("Control+s");

    await expect(page).toHaveURL(wikiPageUrl(FIXTURES.failure.id));
    await expect(page.getByLabel("标题")).toHaveValue(draftTitle);
    await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
      "保存失败，请检查网络后重试",
    );
    await page.reload();
    await waitForHydratedWikiEditor(page);
    const recovery = page.getByRole("dialog", { name: "恢复本地草稿" });
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText(draftTitle);
    await expect(
      recovery.getByRole("button", { name: "复制我的内容" }),
    ).toBeVisible();
    await recovery.getByRole("button", { name: "返回编辑最终结果" }).click();
    await expect(recovery).toHaveCount(0);
    await expect(page.getByLabel("标题")).not.toHaveValue(draftTitle);

    await page.unroute(`**${editPath}`);
    const recoveredTitle = `${draftTitle} recovered`;
    await page.getByLabel("标题").fill(recoveredTitle);
    await page.keyboard.press("Control+s");
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert", { name: "保存错误" })).toHaveCount(0);
  });

  test("background conflict pauses autosave passively until an explicit save", async ({
    browser,
  }) => {
    const markerA = `passive-a-${Date.now()}`;
    const markerB = `passive-b-${Date.now()}`;
    const pageId = FIXTURES.passiveConflict.id;

    const contextA = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 393, height: 851 },
    });
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageA);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageB);

    await appendAfterText(pageB, "Alpha block.", markerB);
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await appendAfterText(pageA, "Alpha block.", markerA);
    await expect(
      pageA.getByRole("status", {
        name: "自动保存已暂停",
      }),
    ).toContainText("服务器版本已更新");
    await expect(pageA.getByText("保存失败", { exact: true })).toHaveCount(0);
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
      0,
    );

    await pageA.getByRole("button", { name: "处理冲突" }).click();
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toBeVisible();
    await expect(pageA.getByText("保存失败", { exact: true })).toHaveCount(0);

    await contextA.close();
    await contextB.close();
  });

  test("a body-only clean merge preserves a concurrent server title", async ({
    browser,
  }) => {
    const serverTitle = `Concurrent title ${Date.now()}`;
    const bodyMarker = `body-only-${Date.now()}`;
    const pageId = FIXTURES.bodyTitleMerge.id;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageA);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageB);

    await pageB.getByLabel("标题").fill(serverTitle);
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "unsaved",
    );
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await appendAfterText(pageA, "Alpha block.", bodyMarker);
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(pageA.getByLabel("标题")).toHaveValue(serverTitle);

    await pageA.goto(`/wiki/${pageId}`);
    await expect(pageA.getByLabel("标题")).toHaveValue(serverTitle);
    await expect(pageA.locator('[role="textbox"]').first()).toContainText(
      bodyMarker,
    );

    await contextA.close();
    await contextB.close();
  });

  test("different concurrent title edits conflict instead of overwriting either draft", async ({
    browser,
  }) => {
    const mineTitle = `Mine title ${Date.now()}`;
    const serverTitle = `Server title ${Date.now()}`;
    const pageId = FIXTURES.titleConflict.id;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageA);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageB);

    await pageB.getByLabel("标题").fill(serverTitle);
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "unsaved",
    );
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await pageA.getByLabel("标题").fill(mineTitle);
    await expect(
      pageA.getByRole("status", { name: "自动保存已暂停" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByLabel("标题")).toHaveValue(mineTitle);

    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toBeVisible();

    await pageB.goto(`/wiki/${pageId}`);
    await expect(pageB.getByLabel("标题")).toHaveValue(serverTitle);

    await contextA.close();
    await contextB.close();
  });
});

test.describe("#431 authoritative autosave baseline", () => {
  test("a clean merge is adopted before a later save, preserving both editors", async ({
    browser,
  }) => {
    const markerA = `editor-a-${Date.now()}`;
    const markerB = `editor-b-${Date.now()}`;
    const trailingMarker = `editor-a-trailing-${Date.now()}`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${MERGE_ID}`);
    await waitForHydratedWikiEditor(pageA);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/${MERGE_ID}`);
    await waitForHydratedWikiEditor(pageB);

    // B advances the server copy by editing a different top-level block.
    await appendAfterText(pageB, "Beta block.", markerB);
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    // A is still on the original baseline. Its non-overlapping edit should
    // clean-merge and the editor should adopt the authoritative merged copy.
    await appendAfterText(pageA, "Alpha block.", markerA);
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(pageA.locator('[role="textbox"]').first()).toContainText(
      markerB,
    );

    // A continues from that merged copy. A later optimistic write must not
    // overwrite B's already-merged block.
    await appendAfterText(pageA, "Gamma block.", trailingMarker);
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    // Re-open the edit route to prove the server retained all three changes.
    await pageA.goto(`/wiki/${MERGE_ID}`);
    const persistedEditor = pageA.locator('[role="textbox"]').first();
    await expect(persistedEditor).toContainText(markerA);
    await expect(persistedEditor).toContainText(markerB);
    await expect(persistedEditor).toContainText(trailingMarker);

    await contextA.close();
    await contextB.close();
  });
});
