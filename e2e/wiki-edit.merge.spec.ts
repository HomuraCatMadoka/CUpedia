import { expect, test } from "@playwright/test";

import {
  cleanupWikiAutosaveFixtures,
  FIXTURES,
  MERGE_ID,
  appendAfterText,
  formatText,
  readLocalDraftSnapshot,
  readPersistedContent,
  readPersistedTitle,
  writeRemoteTitle,
  loginAsAdmin,
  captureWikiPollingAction,
  waitForHydratedWikiEditor,
  provisionWikiAutosaveFixtures,
} from "./helpers/wiki-edit-autosave";

test.beforeAll(provisionWikiAutosaveFixtures);
test.afterAll(cleanupWikiAutosaveFixtures);

test.describe("#431 authoritative autosave baseline", () => {
  test("formatting added while the first save response is held drains without conflict", async ({
    page,
  }) => {
    const pageId = FIXTURES.inFlightFormatting.id;
    const editPath = `/wiki/${pageId}`;
    let releaseFirstResponse!: () => void;
    let markFirstCommitted!: () => void;
    const firstResponseReleased = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve;
    });
    const firstCommitted = new Promise<void>((resolve) => {
      markFirstCommitted = resolve;
    });
    let heldFirstSave = false;

    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    await page.route(`**${editPath}`, async (route) => {
      if (
        route.request().method() !== "POST" ||
        route.request().headers()["next-action"] === pollingAction ||
        heldFirstSave
      ) {
        await route.continue();
        return;
      }
      heldFirstSave = true;
      const response = await route.fetch();
      markFirstCommitted();
      await firstResponseReleased;
      await route.fulfill({ response });
    });

    await formatText(page, "Alpha block.", "Control+b");
    await firstCommitted;
    await page.keyboard.press("Control+i");
    releaseFirstResponse();

    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("status", { name: "自动保存已暂停" }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect
      .poll(async () => (await readPersistedContent(pageId))[0])
      .toMatchObject({
        type: "p",
        children: [{ text: "Alpha block.", bold: true, italic: true }],
      });
  });

  test("concurrent formatting of the same text merges without interrupting editing", async ({
    browser,
  }) => {
    const pageId = FIXTURES.formattingMerge.id;
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

    await formatText(pageB, "Alpha block.", "Control+i");
    await expect(
      pageB.locator('[role="textbox"] em').filter({ hasText: "Alpha block." }),
    ).toBeVisible();
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect
      .poll(async () => (await readPersistedContent(pageId))[0])
      .toMatchObject({
        type: "p",
        children: [{ text: "Alpha block.", italic: true }],
      });

    await formatText(pageA, "Alpha block.", "Control+b");
    await expect(
      pageA
        .locator('[role="textbox"] strong')
        .filter({ hasText: "Alpha block." }),
    ).toBeVisible();
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(
      pageA.getByRole("status", { name: "自动保存已暂停" }),
    ).toHaveCount(0);
    await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
      0,
    );

    await expect
      .poll(() => readPersistedContent(pageId))
      .toMatchObject([
        {
          type: "p",
          children: [{ text: "Alpha block.", bold: true, italic: true }],
        },
        { type: "p", children: [{ text: "Beta block." }] },
        { type: "p", children: [{ text: "Gamma block." }] },
      ]);

    await contextA.close();
    await contextB.close();
  });

  test("distinct edit summaries survive identical concurrent page submissions", async ({
    browser,
  }) => {
    const pageId = FIXTURES.identicalSummarySessions.id;
    const editPath = `/wiki/${pageId}`;
    const summaryA = `Identical state summary A ${Date.now()}`;
    const summaryB = `Identical state summary B ${Date.now()}`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(editPath);
      await waitForHydratedWikiEditor(pageA);
      await loginAsAdmin(pageB);
      await pageB.goto(editPath);
      await waitForHydratedWikiEditor(pageB);
      const pollingAction = await captureWikiPollingAction(pageB, pageId);
      await pageB.route(`**${editPath}`, async (route) => {
        if (
          route.request().method() === "POST" &&
          route.request().headers()["next-action"] === pollingAction
        ) {
          await route.abort("failed");
          return;
        }
        await route.continue();
      });

      await pageA.getByRole("button", { name: "页面设置" }).click();
      await pageA
        .getByRole("dialog", { name: "页面设置" })
        .getByRole("textbox", { name: "编辑摘要（可选）" })
        .fill(summaryA);
      await pageA.keyboard.press("Escape");
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      await pageB.getByRole("button", { name: "页面设置" }).click();
      await pageB
        .getByRole("dialog", { name: "页面设置" })
        .getByRole("textbox", { name: "编辑摘要（可选）" })
        .fill(summaryB);
      await pageB.keyboard.press("Escape");
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(pageB.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
        0,
      );

      await pageB.goto(`/wiki/history/${pageId}`);
      await expect(pageB.getByText(summaryB, { exact: false })).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

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

  test("an edit summary typed behind a clean merge is saved on the merged baseline", async ({
    browser,
  }) => {
    test.slow();
    const pageId = FIXTURES.mergeTrailingSummary.id;
    const editPath = `/wiki/${pageId}`;
    const markerA = `summary-merge-a-${Date.now()}`;
    const markerB = `summary-merge-b-${Date.now()}`;
    const trailingSummary = `Summary typed behind merge ${Date.now()}`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    let releaseFirstResponse!: () => void;
    const firstResponseGate = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve;
    });
    let markFirstResponseHeld!: () => void;
    const firstResponseHeld = new Promise<void>((resolve) => {
      markFirstResponseHeld = resolve;
    });

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(editPath);
      await waitForHydratedWikiEditor(pageA);
      const pollingAction = await captureWikiPollingAction(pageA, pageId);
      let heldFirstSave = false;
      await pageA.route(`**${editPath}`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        if (route.request().headers()["next-action"] === pollingAction) {
          await route.abort("failed");
          return;
        }
        if (heldFirstSave) {
          await route.continue();
          return;
        }
        heldFirstSave = true;
        const response = await route.fetch();
        markFirstResponseHeld();
        await firstResponseGate;
        await route.fulfill({ response });
      });

      await loginAsAdmin(pageB);
      await pageB.goto(editPath);
      await waitForHydratedWikiEditor(pageB);
      await appendAfterText(pageB, "Beta block.", markerB);
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      await appendAfterText(pageA, "Alpha block.", markerA);
      await firstResponseHeld;
      await pageA.getByRole("button", { name: "页面设置" }).click();
      await pageA
        .getByRole("dialog", { name: "页面设置" })
        .getByRole("textbox", { name: "编辑摘要（可选）" })
        .fill(trailingSummary);
      await pageA.keyboard.press("Escape");
      await expect
        .poll(
          async () =>
            (await readLocalDraftSnapshot(pageA, pageId))?.editSummary,
        )
        .toBe(trailingSummary);

      releaseFirstResponse();
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 20_000 },
      );
      await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
        0,
      );
      await expect(
        pageA.getByRole("status", { name: "自动保存已暂停" }),
      ).toHaveCount(0);
      await expect
        .poll(async () => JSON.stringify(await readPersistedContent(pageId)))
        .toContain(markerA);
      await expect
        .poll(async () => JSON.stringify(await readPersistedContent(pageId)))
        .toContain(markerB);

      await pageA.goto(`/wiki/history/${pageId}`);
      await expect(
        pageA.getByText(trailingSummary, { exact: false }),
      ).toBeVisible();
    } finally {
      releaseFirstResponse();
      await contextA.close();
      await contextB.close();
    }
  });

  test("a failed conflict discard preserves the trailing draft and clean remote merge", async ({
    browser,
  }) => {
    test.slow();
    const pageId = FIXTURES.mergeTrailingRefresh.id;
    const markerA = `merge-refresh-a-${Date.now()}`;
    const markerB = `merge-refresh-b-${Date.now()}`;
    const trailingMarker = `merge-refresh-trailing-${Date.now()}`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    let releaseFirstResponse!: () => void;
    const firstResponseGate = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve;
    });
    let markFirstResponseHeld!: () => void;
    const firstResponseHeld = new Promise<void>((resolve) => {
      markFirstResponseHeld = resolve;
    });

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(`/wiki/${pageId}`);
      await waitForHydratedWikiEditor(pageA);

      await loginAsAdmin(pageB);
      await pageB.goto(`/wiki/${pageId}`);
      await waitForHydratedWikiEditor(pageB);
      const pollingAction = await captureWikiPollingAction(pageA, pageId);

      let postCount = 0;
      await pageA.route(`**/wiki/${pageId}`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        if (route.request().headers()["next-action"] === pollingAction) {
          await route.abort("failed");
          return;
        }
        postCount += 1;
        if (postCount === 1) {
          const response = await route.fetch();
          markFirstResponseHeld();
          await firstResponseGate;
          await route.fulfill({ response });
          return;
        }
        await route.continue();
      });

      await appendAfterText(pageB, "Beta block.", markerB);
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      await appendAfterText(pageA, "Alpha block.", markerA);
      await firstResponseHeld;
      await appendAfterText(pageA, "Gamma block.", trailingMarker, "saving");
      await expect
        .poll(async () =>
          (await readLocalDraftSnapshot(pageA, pageId))?.content.includes(
            trailingMarker,
          ),
        )
        .toBe(true);

      releaseFirstResponse();
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 20_000 },
      );
      await expect
        .poll(async () => JSON.stringify(await readPersistedContent(pageId)))
        .toContain(trailingMarker);

      const remoteTitle = `merge-refresh-remote-${Date.now()}`;
      const localTitle = `merge-refresh-local-${Date.now()}`;
      await writeRemoteTitle(pageId, remoteTitle);
      await pageA.getByLabel("页面标题").fill(localTitle);
      await pageA.keyboard.press("Control+s");

      await expect(
        pageA.getByRole("dialog", { name: "编辑冲突" }),
      ).toBeVisible();
      const localDraftBeforeDiscard = await readLocalDraftSnapshot(
        pageA,
        pageId,
      );
      expect(localDraftBeforeDiscard?.content).toContain(trailingMarker);

      await pageA.evaluate(() => {
        const prototype = IDBObjectStore.prototype;
        const originalDelete = prototype.delete;
        let shouldFail = true;
        Object.defineProperty(prototype, "delete", {
          configurable: true,
          writable: true,
          value(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
            if (shouldFail) {
              shouldFail = false;
              throw new DOMException(
                "Simulated local draft deletion failure",
                "InvalidStateError",
              );
            }
            return originalDelete.call(this, key);
          },
        });
      });
      await pageA
        .getByRole("button", {
          name: "放弃本地草稿并加载服务器版本",
        })
        .click();
      await expect(
        pageA.getByRole("alert", { name: "保存错误" }),
      ).toContainText("无法更新本地草稿，请重试。");
      await pageA.evaluate(() => window.dispatchEvent(new Event("pagehide")));

      const localDraftAfterFailedDiscard = await readLocalDraftSnapshot(
        pageA,
        pageId,
      );
      expect(localDraftAfterFailedDiscard).toMatchObject({
        title: localDraftBeforeDiscard!.title,
        content: localDraftBeforeDiscard!.content,
        editSummary: localDraftBeforeDiscard!.editSummary,
      });
      expect(localDraftAfterFailedDiscard!.updatedAt).toBeGreaterThanOrEqual(
        localDraftBeforeDiscard!.updatedAt,
      );
      await expect(
        pageA.getByRole("dialog", { name: "编辑冲突" }),
      ).toBeVisible();
      await expect
        .poll(async () => JSON.stringify(await readPersistedContent(pageId)))
        .toContain(markerB);
      await expect
        .poll(async () => readPersistedTitle(pageId))
        .toBe(remoteTitle);
    } finally {
      releaseFirstResponse();
      await contextA.close();
      await contextB.close();
    }
  });
});
