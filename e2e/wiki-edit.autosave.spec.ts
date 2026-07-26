import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

const MERGE_SLUG = "getting-started";

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
  await expect(page.getByText("未保存")).toBeVisible();
}

test.describe("#432 latest draft convergence", () => {
  test("a new-page draft uses the same unsaved navigation guards", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.goto("/wiki/new");
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();
    await page.getByLabel("标题").fill(`Guarded draft ${Date.now()}`);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const event = new Event("beforeunload", { cancelable: true });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        }),
      )
      .toBe(true);

    const dialogPromise = page.waitForEvent("dialog");
    const clickPromise = page
      .getByRole("link", { name: "CUpedia" })
      .first()
      .click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain("未保存");
    await dialog.dismiss();
    await clickPromise;
    await expect(page).toHaveURL(/\/wiki\/new$/);
  });

  test("a title-only edit is autosaved and survives a fresh edit read", async ({
    page,
  }) => {
    const title = `Autosaved title ${Date.now()}`;

    await loginAsAdmin(page);
    await page.goto(`/wiki/edit/${MERGE_SLUG}`);
    await expect(page.locator('[role="textbox"]').first()).toBeVisible();

    await page.getByLabel("标题").fill(title);
    await expect(page.getByText("未保存")).toBeVisible();
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status", { name: "保存状态" })).toHaveText(
      "已保存",
    );
    await expect(
      page.getByRole("button", { name: "完成", exact: true }),
    ).toBeVisible();

    await page.goto(`/wiki/edit/${MERGE_SLUG}`);
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
    await page.getByRole("button", { name: "完成" }).click();
    await firstResponseHeld;
    await expect(page.getByRole("button", { name: "完成中…" })).toBeVisible();

    await page.getByLabel("标题").fill(trailingTitle);

    try {
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
    await page.getByRole("button", { name: "完成" }).click();

    await expect(page).toHaveURL(/\/wiki\/edit\/welcome$/);
    await expect(page.getByLabel("标题")).toHaveValue(draftTitle);
    await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
      "保存失败，请检查网络后重试",
    );
    await expect(page.getByRole("button", { name: "完成" })).toBeEnabled();

    await page.unroute("**/wiki/edit/welcome");
    const recoveredTitle = `${draftTitle} recovered`;
    await page.getByLabel("标题").fill(recoveredTitle);
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert", { name: "保存错误" })).toHaveCount(0);
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

    await appendAfterText(pageB, "Budget-friendly meals", markerB);
    await pageB.getByRole("button", { name: "完成" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${slug}$`));

    await appendAfterText(pageA, "Budget-friendly meals", markerA);
    await expect(
      pageA.getByRole("status", {
        name: "自动保存已暂停",
      }),
    ).toContainText("服务器版本已更新");
    await expect(pageA.getByText("保存失败", { exact: true })).toHaveCount(0);
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
      0,
    );

    await pageA.getByRole("button", { name: "完成" }).click();
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

    await pageB.getByLabel("标题").fill(serverTitle);
    await pageB.getByRole("button", { name: "完成" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${slug}$`));

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
    await pageB.getByRole("button", { name: "完成" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${slug}$`));

    await pageA.getByLabel("标题").fill(mineTitle);
    await expect(
      pageA.getByRole("status", { name: "自动保存已暂停" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByLabel("标题")).toHaveValue(mineTitle);

    await pageA.getByRole("button", { name: "完成" }).click();
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toBeVisible();

    await pageB.goto(`/wiki/edit/${slug}`);
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
    await pageA.goto(`/wiki/edit/${MERGE_SLUG}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${MERGE_SLUG}`);
    await expect(pageB.locator('[role="textbox"]').first()).toBeVisible();

    // B advances the server copy by editing a different top-level block.
    await appendAfterText(pageB, "New to CUHK?", markerB);
    await pageB.getByRole("button", { name: "完成" }).click();
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

    // Re-open the edit route to prove the server retained all three changes.
    await pageA.goto(`/wiki/edit/${MERGE_SLUG}`);
    const persistedEditor = pageA.locator('[role="textbox"]').first();
    await expect(persistedEditor).toContainText(markerA);
    await expect(persistedEditor).toContainText(markerB);
    await expect(persistedEditor).toContainText(trailingMarker);

    await contextA.close();
    await contextB.close();
  });
});
