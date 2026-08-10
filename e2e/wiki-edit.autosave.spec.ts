import { expect, test } from "@playwright/test";

import {
  cleanupWikiAutosaveFixtures,
  FIXTURES,
  MERGE_ID,
  appendAfterText,
  waitForDraftResume,
  holdFirstSaveRequestUntilReleased,
  loginAsAdmin,
  captureWikiPollingAction,
  createUntitledWikiPage,
  waitForHydratedWikiEditor,
  wikiPageUrl,
  provisionWikiAutosaveFixtures,
} from "./helpers/wiki-edit-autosave";

test.beforeAll(provisionWikiAutosaveFixtures);
test.afterAll(cleanupWikiAutosaveFixtures);

test.describe("#432 autosave submission, navigation, and conflicts", () => {
  test("a committed save with a lost response is resolved before a later edit", async ({
    page,
  }) => {
    const pageId = FIXTURES.unknownOutcome.id;
    const editPath = `/wiki/${pageId}`;
    const committedTitle = `Committed unseen ${Date.now()}`;
    const finalTitle = `${committedTitle} final`;
    let markCommitted!: () => void;
    const committed = new Promise<void>((resolve) => {
      markCommitted = resolve;
    });
    let droppedFirstResponse = false;

    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    await page.route(`**${editPath}`, async (route) => {
      if (
        route.request().method() !== "POST" ||
        route.request().headers()["next-action"] === pollingAction ||
        droppedFirstResponse
      ) {
        await route.continue();
        return;
      }
      droppedFirstResponse = true;
      await route.fetch();
      markCommitted();
      await route.abort("failed");
    });

    await page.getByLabel("页面标题").fill(committedTitle);
    await committed;
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "error",
    );

    await page.getByLabel("页面标题").fill(finalTitle);
    await page.keyboard.press("Control+s");
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(0);

    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toHaveValue(finalTitle);
  });

  test("an edit immediately followed by navigation is persisted", async ({
    page,
  }) => {
    const pageId = FIXTURES.immediateNavigation.id;
    const title = `Immediate navigation ${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(page);

    await page.evaluate((nextTitle) => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="页面标题"]',
      );
      const link = document.querySelector<HTMLAnchorElement>(
        'a[aria-label="返回 Wiki"]',
      );
      if (!input || !link)
        throw new Error("Editor navigation controls missing");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, nextTitle);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      link.click();
    }, title);

    await expect(page).toHaveURL(/\/wiki$/, { timeout: 30_000 });
    await page.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toHaveValue(title);
    await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(0);
  });

  test("navigation stops accepting edits while its final drain is in flight", async ({
    page,
  }) => {
    const pageId = FIXTURES.navigationFence.id;
    const editPath = `/wiki/${pageId}`;
    const title = `Navigation fence ${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    const heldSave = await holdFirstSaveRequestUntilReleased(
      page,
      editPath,
      pollingAction,
    );
    await page.getByLabel("页面标题").fill(title);

    const navigation = page.getByRole("link", { name: "返回 Wiki" }).click();
    try {
      await heldSave.seen;
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "inert",
        "",
      );
    } finally {
      heldSave.release();
    }

    await navigation;
    await expect(page).toHaveURL(/\/wiki$/);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toHaveValue(title);
  });

  test("a newly created page autosaves before navigation", async ({ page }) => {
    await loginAsAdmin(page);

    await createUntitledWikiPage(page);
    await waitForHydratedWikiEditor(page);
    await page
      .getByLabel("页面标题", { exact: true })
      .fill(`Guarded draft ${Date.now()}`);

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

    await page.getByLabel("页面标题", { exact: true }).fill(title);
    await expect(page.getByText("未保存")).toBeVisible();
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status", { name: "保存状态" })).toHaveText(
      "已保存",
    );
    await expect(
      page.getByRole("button", { name: "完成", exact: true }),
    ).toBeHidden();

    await page.goto(`/wiki/${MERGE_ID}`);
    await expect(page.getByLabel("页面标题", { exact: true })).toHaveValue(
      title,
    );
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
    await page.getByLabel("页面标题", { exact: true }).fill(draftTitle);
    await page.keyboard.press("Control+s");

    await expect(page).toHaveURL(wikiPageUrl(FIXTURES.failure.id));
    await expect(page.getByLabel("页面标题", { exact: true })).toHaveValue(
      draftTitle,
    );
    await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
      "保存失败，请检查网络后重试",
    );
    await page.reload();
    await waitForHydratedWikiEditor(page);
    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("页面标题", { exact: true })).toHaveValue(
      draftTitle,
    );
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "error",
      { timeout: 15_000 },
    );

    await page.unroute(`**${editPath}`);
    await page.keyboard.press("Control+s");
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert", { name: "保存错误" })).toHaveCount(0);
    await page.reload();
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题", { exact: true })).toHaveValue(
      draftTitle,
    );
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

    const pollingAction = await captureWikiPollingAction(pageA, pageId);
    const firstSave = await holdFirstSaveRequestUntilReleased(
      pageA,
      `/wiki/${pageId}`,
      pollingAction,
    );
    await pageA.getByLabel("页面标题", { exact: true }).fill(mineTitle);
    await firstSave.seen;

    await pageB.getByLabel("页面标题", { exact: true }).fill(serverTitle);
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

    firstSave.release();
    await expect(
      pageA.getByRole("status", { name: "自动保存已暂停" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByLabel("页面标题", { exact: true })).toHaveValue(
      mineTitle,
    );

    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toBeVisible();

    await pageB.goto(`/wiki/${pageId}`);
    await expect(pageB.getByLabel("页面标题", { exact: true })).toHaveValue(
      serverTitle,
    );

    await contextA.close();
    await contextB.close();
  });

  test("refreshing after returning from a conflict never replays the rejected draft", async ({
    browser,
  }) => {
    const mineTitle = `Rejected title ${Date.now()}`;
    const serverTitle = `Accepted title ${Date.now()}`;
    const pageId = FIXTURES.conflictReturnRefresh.id;

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

    const pollingAction = await captureWikiPollingAction(pageA, pageId);
    const firstSave = await holdFirstSaveRequestUntilReleased(
      pageA,
      `/wiki/${pageId}`,
      pollingAction,
    );
    await pageA.getByLabel("页面标题", { exact: true }).fill(mineTitle);
    await firstSave.seen;

    await pageB.getByLabel("页面标题", { exact: true }).fill(serverTitle);
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    firstSave.release();
    await expect(
      pageA.getByRole("status", { name: "自动保存已暂停" }),
    ).toBeVisible({ timeout: 15_000 });
    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toBeVisible();
    await pageA.getByRole("button", { name: "返回编辑最终结果" }).click();
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
      0,
    );
    await expect(pageA.getByLabel("页面标题", { exact: true })).toHaveValue(
      serverTitle,
    );

    // Let the conflict flow leave its two-frame suspension before reloading.
    // An immediate reload only exercises the temporary suspended guard and
    // misses the normal pagehide flush that used to delete the manual draft.
    await waitForDraftResume(pageA);

    await pageA.reload();
    await waitForHydratedWikiEditor(pageA);
    await expect(
      pageA.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toBeVisible();
    await expect(
      pageA.getByRole("region", { name: "页面属性冲突" }),
    ).toContainText(mineTitle);

    await pageA.getByRole("button", { name: "返回编辑最终结果" }).click();
    await expect(
      pageA.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await waitForDraftResume(pageA);
    await pageA.reload();
    await waitForHydratedWikiEditor(pageA);
    await expect(
      pageA.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toBeVisible();
    await expect(
      pageA.getByRole("region", { name: "页面属性冲突" }),
    ).toContainText(mineTitle);

    await pageB.reload();
    await waitForHydratedWikiEditor(pageB);
    await expect(pageB.getByLabel("页面标题", { exact: true })).toHaveValue(
      serverTitle,
    );

    await contextA.close();
    await contextB.close();
  });
});
