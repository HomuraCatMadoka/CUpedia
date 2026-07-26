import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

const MERGE_SLUG = "getting-started";

async function appendAfterText(
  page: Page,
  anchor: string,
  marker: string,
  expectUnsaved = true,
  singleInputEvent = false,
) {
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible();

  const text = editor
    .locator('[data-slate-node="text"]')
    .filter({ hasText: anchor })
    .first();
  await expect(text).toBeVisible();
  await text.click();
  await page.keyboard.press("End");
  if (singleInputEvent) {
    // A single browser text-input event models paste/IME commit and avoids
    // Playwright continuing to type into a text node Plate replaced after the
    // first character while a React Server Action is pending.
    await page.keyboard.insertText(` ${marker}`);
  } else {
    await page.keyboard.type(` ${marker}`);
  }

  await expect(editor).toContainText(marker);
  if (expectUnsaved) {
    await expect(page.getByText("未保存")).toBeVisible();
  }
}

test.describe("authoritative autosave baseline", () => {
  test("a clean merge is adopted before a later save, preserving both editors", async ({
    browser,
  }) => {
    const markerA = `editor-a-${Date.now()}`;
    const markerB = `editor-b-${Date.now()}`;
    const trailingMarker = `editor-a-trailing-${Date.now()}`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/edit/${MERGE_SLUG}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${MERGE_SLUG}`);
    await expect(pageB.locator('[role="textbox"]').first()).toBeVisible();

    // B advances the server copy by editing a different top-level block.
    await appendAfterText(pageB, "New to CUHK?", markerB);
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${MERGE_SLUG}$`));

    // A is still on the original baseline. Its non-overlapping edit should
    // clean-merge and the editor should adopt the authoritative merged copy.
    await appendAfterText(pageA, "for course registration.", markerA);
    await expect(pageA.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(pageA.locator('[role="textbox"]').first()).toContainText(
      markerB,
    );

    // A continues from that merged copy. A later optimistic write must not
    // overwrite B's already-merged block.
    await appendAfterText(pageA, "Registration", trailingMarker);
    await expect(pageA.getByText("已保存")).toBeVisible({ timeout: 15_000 });

    // Re-open the fresh edit read (the public read route is intentionally
    // cacheable) to prove what is actually persisted, not just local DOM state.
    await pageA.goto(`/wiki/edit/${MERGE_SLUG}`);
    const persistedEditor = pageA.locator('[role="textbox"]').first();
    await expect(persistedEditor).toContainText(markerA);
    await expect(persistedEditor).toContainText(trailingMarker);
    await expect(persistedEditor).toContainText(markerB);

    await contextA.close();
    await contextB.close();
  });
});

test.describe("latest draft flush", () => {
  test("a title-only edit is autosaved and survives a fresh edit read", async ({
    page,
  }) => {
    const title = `Autosaved title ${Date.now()}`;

    await loginAsAdmin(page);
    await page.goto("/wiki/edit/welcome");
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();

    await page.getByLabel("标题").fill(title);
    await expect(page.getByText("未保存")).toBeVisible();
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });

    await page.goto("/wiki/edit/welcome");
    await expect(page.getByLabel("标题")).toHaveValue(title);
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

    await page.route("**/wiki/edit/campus-life", async (route) => {
      if (route.request().method() === "POST" && !held) {
        held = true;
        // Let the server commit the autosave, but withhold its response from
        // the editor. The client therefore still has an in-flight request and
        // a stale optimistic-lock baseline when the user clicks 保存.
        const response = await route.fetch();
        markFirstResponseHeld();
        await firstResponseGate;
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });

    await page.goto("/wiki/edit/campus-life");
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();
    await page.getByLabel("标题").fill(firstTitle);
    await page.getByRole("button", { name: "保存" }).click();
    await firstResponseHeld;
    await expect(page.getByRole("button", { name: "保存中..." })).toBeVisible();

    // This edit happens after the explicit save snapshot has committed on the
    // server but before its response reaches the editor.
    await page.getByLabel("标题").fill(trailingTitle);

    try {
      // The editor must remain mounted while the first response is held.
      const navigatedEarly = await page
        .waitForURL(/\/wiki\/campus-life$/, { timeout: 1_000 })
        .then(
          () => true,
          () => false,
        );
      expect(navigatedEarly).toBe(false);
    } finally {
      releaseFirstResponse();
    }

    await expect(page).toHaveURL(/\/wiki\/campus-life$/, {
      timeout: 15_000,
    });
    await page.goto("/wiki/edit/campus-life");
    await expect(page.getByLabel("标题")).toHaveValue(trailingTitle);
  });

  test("background conflict pauses autosave passively until an explicit save", async ({
    browser,
  }) => {
    const markerA = `passive-a-${Date.now()}`;
    const markerB = `passive-b-${Date.now()}`;
    const slug = "campus-life/dining/united";

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/edit/${slug}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${slug}`);
    await expect(pageB.locator('[role="textbox"]').first()).toBeVisible();

    // B advances the same block that A will edit from its stale baseline.
    await appendAfterText(pageB, "Budget-friendly meals", markerB);
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${slug}$`));

    // A's background autosave hits a same-block conflict. It must not interrupt
    // typing with a modal; the passive status explains that autosave paused.
    await appendAfterText(pageA, "Budget-friendly meals", markerA);
    await expect(
      pageA.getByRole("status", {
        name: "自动保存已暂停",
      }),
    ).toContainText("服务器版本已更新");
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
      0,
    );

    // An explicit save upgrades the same conflict to the resolution dialog.
    await pageA.getByRole("button", { name: "保存" }).click();
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test("a body-only clean merge preserves a concurrent server title", async ({
    browser,
  }) => {
    const serverTitle = `Concurrent title ${Date.now()}`;
    const bodyMarker = `body-only-${Date.now()}`;
    const slug = "history-demo";

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/edit/${slug}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${slug}`);
    await expect(pageB.locator('[role="textbox"]').first()).toBeVisible();

    // B renames the page while A remains on the original title baseline.
    await pageB.getByLabel("标题").fill(serverTitle);
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${slug}$`));

    // A changes only the body. Its clean content merge must adopt B's title
    // instead of silently reverting it to A's stale title.
    await appendAfterText(pageA, "First draft of the page.", bodyMarker);
    await expect(pageA.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByLabel("标题")).toHaveValue(serverTitle);

    await pageA.goto(`/wiki/edit/${slug}`);
    await expect(pageA.getByLabel("标题")).toHaveValue(serverTitle);
    await expect(pageA.locator('[role="textbox"]').first()).toContainText(
      bodyMarker,
    );

    await contextA.close();
    await contextB.close();
  });

  test("a failed explicit save keeps the draft open with retryable feedback", async ({
    page,
  }) => {
    const draftTitle = `Offline draft ${Date.now()}`;

    await loginAsAdmin(page);
    await page.route("**/wiki/edit/welcome", async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/wiki/edit/welcome");
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();
    await page.getByLabel("标题").fill(draftTitle);
    await page.getByRole("button", { name: "保存" }).click();

    await expect(page).toHaveURL(/\/wiki\/edit\/welcome$/);
    await expect(page.getByLabel("标题")).toHaveValue(draftTitle);
    await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
      "保存失败，请检查网络后重试",
    );
    await expect(page.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  test("different concurrent title edits conflict instead of overwriting either draft", async ({
    browser,
  }) => {
    const mineTitle = `Mine title ${Date.now()}`;
    const serverTitle = `Server title ${Date.now()}`;
    const slug = "rich-content-demo";

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/edit/${slug}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${slug}`);
    await expect(pageB.locator('[role="textbox"]').first()).toBeVisible();

    await pageB.getByLabel("标题").fill(serverTitle);
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${slug}$`));

    await pageA.getByLabel("标题").fill(mineTitle);
    await expect(
      pageA.getByRole("status", { name: "自动保存已暂停" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByLabel("标题")).toHaveValue(mineTitle);

    await pageA.getByRole("button", { name: "保存" }).click();
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toBeVisible();

    await pageB.goto(`/wiki/edit/${slug}`);
    await expect(pageB.getByLabel("标题")).toHaveValue(serverTitle);

    await contextA.close();
    await contextB.close();
  });

  test("a clean merge response does not erase content typed while it was in flight", async ({
    browser,
  }) => {
    const markerA = `merge-request-a-${Date.now()}`;
    const markerB = `merge-request-b-${Date.now()}`;
    const trailingMarker = `merge-request-trailing-${Date.now()}`;
    const slug = "campus-life/dining";

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/edit/${slug}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${slug}`);
    await expect(pageB.locator('[role="textbox"]').first()).toBeVisible();

    await appendAfterText(pageB, "CUHK has many canteens", markerB);
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${slug}$`));

    let releaseMergedResponse!: () => void;
    const mergedResponseGate = new Promise<void>((resolve) => {
      releaseMergedResponse = resolve;
    });
    let markMergedResponseHeld!: () => void;
    const mergedResponseHeld = new Promise<void>((resolve) => {
      markMergedResponseHeld = resolve;
    });
    let held = false;
    await pageA.route(`**/wiki/edit/${slug}`, async (route) => {
      if (route.request().method() === "POST" && !held) {
        held = true;
        const response = await route.fetch();
        markMergedResponseHeld();
        await mergedResponseGate;
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });

    await appendAfterText(pageA, "Popular Choices", markerA);
    await mergedResponseHeld;
    await expect(pageA.getByText("保存中...")).toBeVisible();
    // This trailing block is not part of the request that just clean-merged.
    await appendAfterText(
      pageA,
      "Shaw College Canteen",
      trailingMarker,
      false,
      true,
    );
    releaseMergedResponse();

    await expect(pageA.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await pageA.goto(`/wiki/edit/${slug}`);
    const persistedEditor = pageA.locator('[role="textbox"]').first();
    await expect(persistedEditor).toContainText(markerA);
    await expect(persistedEditor).toContainText(markerB);
    await expect(persistedEditor).toContainText(trailingMarker);

    await contextA.close();
    await contextB.close();
  });
});
