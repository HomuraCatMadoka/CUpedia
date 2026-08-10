import { expect, test } from "@playwright/test";

import {
  cleanupWikiAutosaveFixtures,
  FIXTURES,
  appendAfterText,
  readLocalDraftSnapshot,
  holdFirstSaveRequestUntilReleased,
  loginAsAdmin,
  captureWikiPollingAction,
  waitForHydratedWikiEditor,
  provisionWikiAutosaveFixtures,
} from "./helpers/wiki-edit-autosave";

test.beforeAll(provisionWikiAutosaveFixtures);
test.afterAll(cleanupWikiAutosaveFixtures);

test.describe("#432 autosave IME boundaries", () => {
  test("a same-browser update cannot replace native IME composition", async ({
    context,
    page: pageA,
  }) => {
    const pageId = FIXTURES.imeCompositionSync.id;
    const remoteTitle = `Remote during IME ${Date.now()}`;

    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageA);
    const pageB = await context.newPage();
    await pageB.goto(`/wiki/${pageId}`);
    const editorB = await waitForHydratedWikiEditor(pageB);

    const alphaBlock = editorB
      .locator('[data-slate-node="text"]')
      .filter({ hasText: "Alpha block." })
      .first();
    await alphaBlock.click();
    await pageB.keyboard.press("End");
    const cdp = await context.newCDPSession(pageB);
    await cdp.send("Input.imeSetComposition", {
      text: "字",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await expect(editorB).toContainText("字");

    await pageA.getByLabel("页面标题").fill(remoteTitle);
    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await expect(editorB).toContainText("字");
    await expect(pageB.getByLabel("页面标题")).toHaveValue(
      FIXTURES.imeCompositionSync.title,
    );
    await expect(pageB.getByRole("dialog")).toHaveCount(0);

    await cdp.send("Input.insertText", { text: "字" });
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(pageB.getByLabel("页面标题")).toHaveValue(remoteTitle);
    await expect(editorB).toContainText("字");
    await expect(pageB.getByRole("dialog")).toHaveCount(0);
  });

  test("an autosave clean merge cannot move native IME composition", async ({
    context,
    page: pageA,
  }) => {
    const pageId = FIXTURES.imeAutosaveMerge.id;
    const remoteMarker = `remote merge ${Date.now()}`;

    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    const editorA = await waitForHydratedWikiEditor(pageA);
    const pageB = await context.newPage();
    await pageB.goto(`/wiki/${pageId}`);
    const editorB = await waitForHydratedWikiEditor(pageB);
    const pollingAction = await captureWikiPollingAction(pageB, pageId);
    let localSaveRequests = 0;
    await pageB.route(`**/wiki/${pageId}`, async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().headers()["next-action"] !== pollingAction
      ) {
        localSaveRequests += 1;
      }
      await route.continue();
    });
    await pageB.clock.install();

    try {
      await pageB
        .getByLabel("页面标题")
        .fill(`Local title during IME ${Date.now()}`);
      const composingBlock = editorB
        .locator('[data-slate-node="text"]')
        .filter({ hasText: "Alpha block." })
        .first();
      await composingBlock.click();
      await pageB.keyboard.press("End");
      const cdp = await context.newCDPSession(pageB);
      await cdp.send("Input.imeSetComposition", {
        text: "字",
        selectionStart: 1,
        selectionEnd: 1,
      });
      await expect(editorB).toContainText("字");
      const provisionalAlpha = await editorB
        .locator('[data-slate-node="element"]')
        .filter({ hasText: "Alpha" })
        .first()
        .textContent();

      // The title edit armed autosave before composition began. Its timer must
      // not serialize or submit a provisional IME document.
      await pageB.clock.fastForward(1_700);
      expect(localSaveRequests).toBe(0);
      await pageB.clock.resume();

      const remoteBlock = editorA
        .locator('[data-slate-node="text"]')
        .filter({ hasText: "Beta block." })
        .first();
      await remoteBlock.click();
      await pageA.keyboard.press("End");
      await pageA.keyboard.insertText(` ${remoteMarker}`);
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      // The same-browser revision is fenced while composition is active. Once
      // the final text is committed, an explicit save may clean-merge it.
      await expect(editorB).not.toContainText(remoteMarker);
      await cdp.send("Input.insertText", { text: "字" });
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      expect(localSaveRequests).toBe(1);
      await expect(editorB).toContainText(remoteMarker);
      await expect(
        editorB
          .locator('[data-slate-node="element"]')
          .filter({ hasText: "Alpha" })
          .first(),
      ).toHaveText(provisionalAlpha!);
      await expect(pageB.getByRole("dialog")).toHaveCount(0);
    } finally {
      await pageB.close();
    }
  });

  test("title IME composition also holds autosave until the committed value", async ({
    context,
    page,
  }) => {
    const pageId = FIXTURES.imeTitle.id;
    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    let localSaveRequests = 0;
    await page.route(`**/wiki/${pageId}`, async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().headers()["next-action"] !== pollingAction
      ) {
        localSaveRequests += 1;
      }
      await route.continue();
    });
    await page.clock.install();

    const title = page.getByLabel("页面标题");
    await title.click();
    await page.keyboard.press("End");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "字",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await expect.poll(() => title.inputValue()).toContain("字");
    const provisionalTitle = await title.inputValue();

    await page.clock.fastForward(1_700);
    expect(localSaveRequests).toBe(0);
    await page.clock.resume();

    await cdp.send("Input.insertText", { text: "字" });
    await page.keyboard.press("Control+s");
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    expect(localSaveRequests).toBe(1);
    await expect(title).toHaveValue(provisionalTitle);

    await page.reload();
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toHaveValue(provisionalTitle);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("pagehide persists the stable snapshot around title IME composition", async ({
    context,
    page,
  }) => {
    const pageId = FIXTURES.imePagehide.id;
    const stableMarker = `stable before title IME ${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);
    const editor = await waitForHydratedWikiEditor(page);

    await appendAfterText(page, "Alpha block.", stableMarker);
    await expect
      .poll(async () =>
        (await readLocalDraftSnapshot(page, pageId))?.content.includes(
          stableMarker,
        ),
      )
      .toBe(true);
    const stableDraft = await readLocalDraftSnapshot(page, pageId);
    if (!stableDraft) throw new Error("Expected the stable Local draft");
    const stableUpdatedAt = stableDraft.updatedAt;
    const title = page.getByLabel("页面标题");
    await title.click();
    await page.keyboard.press("End");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "字",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await expect.poll(() => title.inputValue()).toContain("字");

    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect
      .poll(async () => (await readLocalDraftSnapshot(page, pageId))?.updatedAt)
      .toBeGreaterThan(stableUpdatedAt);
    const hiddenDraft = await readLocalDraftSnapshot(page, pageId);
    expect(hiddenDraft?.title).toBe(FIXTURES.imePagehide.title);
    expect(hiddenDraft?.content).toContain(stableMarker);

    await cdp.send("Input.insertText", { text: "字" });
    await expect
      .poll(async () => (await readLocalDraftSnapshot(page, pageId))?.title)
      .toContain("字");
    await expect(editor).toContainText(stableMarker);
  });

  test("an in-flight clean merge waits for native IME composition to finish", async ({
    context,
    page: pageA,
  }) => {
    const pageId = FIXTURES.imeInFlightMerge.id;
    const remoteMarker = `remote while request in flight ${Date.now()}`;

    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    const editorA = await waitForHydratedWikiEditor(pageA);
    const pageB = await context.newPage();
    await pageB.goto(`/wiki/${pageId}`);
    const editorB = await waitForHydratedWikiEditor(pageB);
    const pollingAction = await captureWikiPollingAction(pageB, pageId);
    const heldLocalSave = await holdFirstSaveRequestUntilReleased(
      pageB,
      `/wiki/${pageId}`,
      pollingAction,
    );

    try {
      await pageB
        .getByLabel("页面标题")
        .fill(`Local request before IME ${Date.now()}`);
      await heldLocalSave.seen;

      const alphaText = editorB
        .locator('[data-slate-node="text"]')
        .filter({ hasText: "Alpha block." })
        .first();
      await alphaText.click();
      await pageB.keyboard.press("End");
      const cdp = await context.newCDPSession(pageB);
      await cdp.send("Input.imeSetComposition", {
        text: "字",
        selectionStart: 1,
        selectionEnd: 1,
      });
      await expect(editorB).toContainText("字");
      const provisionalAlpha = await editorB
        .locator('[data-slate-node="element"]')
        .filter({ hasText: "Alpha" })
        .first()
        .textContent();

      const remoteBlock = editorA
        .locator('[data-slate-node="text"]')
        .filter({ hasText: "Beta block." })
        .first();
      await remoteBlock.click();
      await pageA.keyboard.press("End");
      await pageA.keyboard.insertText(` ${remoteMarker}`);
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      const saveResponse = pageB.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.request().headers()["next-action"] !== pollingAction &&
          response.url().includes(`/wiki/${pageId}`),
      );
      heldLocalSave.release();
      await saveResponse;
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saving",
      );
      await expect(
        editorB
          .locator('[data-slate-node="element"]')
          .filter({ hasText: "Alpha" })
          .first(),
      ).toHaveText(provisionalAlpha!);
      await expect(editorB).not.toContainText(remoteMarker);

      await cdp.send("Input.insertText", { text: "字" });
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(editorB).toContainText(remoteMarker);
      await expect(
        editorB
          .locator('[data-slate-node="element"]')
          .filter({ hasText: "Alpha" })
          .first(),
      ).toHaveText(provisionalAlpha!);
      await expect(pageB.getByRole("dialog")).toHaveCount(0);
    } finally {
      heldLocalSave.release();
      await pageB.close();
    }
  });
});
