import { expect, test } from "@playwright/test";

import {
  appendAfterText,
  cleanupWikiAutosaveFixtures,
  FIXTURES,
  selectText,
  readPersistedContent,
  readPersistedParent,
  writeRemoteContent,
  writeRemoteParent,
  holdNextPollingRequestUntilReleased,
  holdFirstSaveResponseUntilReleased,
  loginAsAdmin,
  captureWikiPollingAction,
  waitForHydratedWikiEditor,
  provisionWikiAutosaveFixtures,
} from "./helpers/wiki-edit-autosave";

test.beforeAll(provisionWikiAutosaveFixtures);
test.afterAll(cleanupWikiAutosaveFixtures);

test.describe("#432 autosave remote sync", () => {
  test("moving a child cannot make a stale parent edit delete its hidden legacy link", async ({
    browser,
  }) => {
    test.slow();
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(`/wiki/${FIXTURES.topologyChild.id}`);
      await waitForHydratedWikiEditor(pageA);
      await pageA
        .getByLabel("页面标题")
        .fill(`Topology child cache primed ${Date.now()}`);
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect
        .poll(() => readPersistedParent(FIXTURES.topologyChild.id))
        .toBe(FIXTURES.topologyParent.id);
      await pageA.reload();
      await waitForHydratedWikiEditor(pageA);

      await loginAsAdmin(pageB);
      await pageB.goto(`/wiki/${FIXTURES.topologyParent.id}`);
      const parentEditor = await waitForHydratedWikiEditor(pageB);
      await expect(parentEditor).not.toContainText(
        FIXTURES.topologyChild.title,
      );

      await pageA.getByRole("button", { name: "页面设置" }).click();
      await pageA
        .getByRole("dialog", { name: "页面设置" })
        .getByRole("combobox", { name: "父页面" })
        .selectOption(FIXTURES.topologyOtherParent.id);
      await pageA.keyboard.press("Escape");
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect
        .poll(() => readPersistedParent(FIXTURES.topologyChild.id))
        .toBe(FIXTURES.topologyOtherParent.id);

      await pageB
        .getByLabel("页面标题")
        .fill(`Topology parent edited ${Date.now()}`);
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(pageB.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
        0,
      );
      await expect(parentEditor).toContainText(FIXTURES.topologyChild.title);

      await pageB.reload();
      const persistedEditor = await waitForHydratedWikiEditor(pageB);
      await expect(persistedEditor).toContainText(FIXTURES.topologyChild.title);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("a newly hidden child link survives the next save from the same mounted editor", async ({
    page,
  }) => {
    test.slow();
    try {
      await loginAsAdmin(page);
      await page.goto(`/wiki/${FIXTURES.topologyProjectionParent.id}`);
      const parentEditor = await waitForHydratedWikiEditor(page);
      await expect(parentEditor).toContainText(
        FIXTURES.topologyProjectionChild.title,
      );

      await writeRemoteParent(
        FIXTURES.topologyProjectionChild.id,
        FIXTURES.topologyProjectionParent.id,
      );

      await page
        .getByLabel("页面标题")
        .fill(`Projection first save ${Date.now()}`);
      await page.keyboard.press("Control+s");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(parentEditor).not.toContainText(
        FIXTURES.topologyProjectionChild.title,
      );

      await page
        .getByLabel("页面标题")
        .fill(`Projection second save ${Date.now()}`);
      await page.keyboard.press("Control+s");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect
        .poll(async () =>
          JSON.stringify(
            await readPersistedContent(FIXTURES.topologyProjectionParent.id),
          ),
        )
        .toContain(FIXTURES.topologyProjectionChild.id);

      await writeRemoteParent(
        FIXTURES.topologyProjectionChild.id,
        FIXTURES.topologyProjectionOtherParent.id,
      );
      await page
        .getByLabel("页面标题")
        .fill(`Projection third save ${Date.now()}`);
      await page.keyboard.press("Control+s");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(parentEditor).toContainText(
        FIXTURES.topologyProjectionChild.title,
      );

      await page.reload();
      const persistedEditor = await waitForHydratedWikiEditor(page);
      await expect(persistedEditor).toContainText(
        FIXTURES.topologyProjectionChild.title,
      );
    } finally {
      await writeRemoteParent(
        FIXTURES.topologyProjectionChild.id,
        FIXTURES.topologyProjectionOtherParent.id,
      );
    }
  });

  test("a moved child stays deleted after an empty projection rebases trailing input", async ({
    browser,
    page,
  }) => {
    test.slow();
    const parentId = FIXTURES.topologyEmptyProjectionParent.id;
    const childId = FIXTURES.topologyEmptyProjectionChild.id;
    const editPath = `/wiki/${parentId}`;
    let releaseFirstResponse: (() => void) | undefined;
    const remoteContext = await browser.newContext();
    const remotePage = await remoteContext.newPage();

    try {
      await loginAsAdmin(page);
      await page.goto(editPath);
      const parentEditor = await waitForHydratedWikiEditor(page);
      await expect(parentEditor).not.toContainText(
        FIXTURES.topologyEmptyProjectionChild.title,
      );
      const pollingAction = await captureWikiPollingAction(page, parentId);

      await loginAsAdmin(remotePage);
      await remotePage.goto(`/wiki/${childId}`);
      await waitForHydratedWikiEditor(remotePage);
      await remotePage.getByRole("button", { name: "页面设置" }).click();
      await remotePage
        .getByRole("dialog", { name: "页面设置" })
        .getByRole("combobox", { name: "父页面" })
        .selectOption(FIXTURES.topologyEmptyProjectionOtherParent.id);
      await remotePage.keyboard.press("Escape");
      await remotePage.keyboard.press("Control+s");
      await expect(remotePage.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        {
          timeout: 15_000,
        },
      );
      await expect
        .poll(() => readPersistedParent(childId))
        .toBe(FIXTURES.topologyEmptyProjectionOtherParent.id);
      const firstResponse = await holdFirstSaveResponseUntilReleased(
        page,
        editPath,
        pollingAction,
      );
      releaseFirstResponse = firstResponse.release;
      await page.clock.install();
      await page.clock.pauseAt(await page.evaluate(() => Date.now()));

      await page
        .getByLabel("页面标题")
        .fill(`Projection response held ${Date.now()}`);
      await page.clock.fastForward(1_600);
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saving",
      );
      await firstResponse.ready;

      const trailingMarker = `projection trailing ${Date.now()}`;
      await appendAfterText(
        page,
        "Empty projection parent body.",
        trailingMarker,
        "saving",
      );
      releaseFirstResponse();
      releaseFirstResponse = undefined;

      await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
        0,
      );
      await expect(parentEditor).toContainText(trailingMarker);
      await expect(parentEditor).toContainText(
        FIXTURES.topologyEmptyProjectionChild.title,
      );

      const replacement = `Projection visible link deleted ${Date.now()}`;
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await parentEditor.click();
      await page.keyboard.press(`${modifier}+a`);
      await page.keyboard.press("Backspace");
      await page.keyboard.type(replacement);
      await expect(
        parentEditor.getByRole("link", {
          name: FIXTURES.topologyEmptyProjectionChild.title,
        }),
      ).toHaveCount(0);
      expect(firstResponse.getSubsequentSaveCount()).toBe(0);
      await page.keyboard.press("Control+s");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 20_000 },
      );
      await expect
        .poll(async () => JSON.stringify(await readPersistedContent(parentId)))
        .not.toContain(childId);

      await page.clock.resume();
      await page.reload();
      const persistedEditor = await waitForHydratedWikiEditor(page);
      await expect(persistedEditor).toContainText(replacement);
      await expect(persistedEditor).not.toContainText(
        FIXTURES.topologyEmptyProjectionChild.title,
      );
    } finally {
      releaseFirstResponse?.();
      await remoteContext.close();
    }
  });

  test("a clean same-browser tab adopts a saved update without writing", async ({
    context,
    page: pageA,
  }) => {
    const pageId = FIXTURES.passiveTabSync.id;
    const title = `Passive tab sync ${Date.now()}`;

    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageA);
    const pageB = await context.newPage();
    await pageB.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageB);

    await pageA.getByLabel("页面标题").fill(title);
    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await expect(pageB.getByLabel("页面标题")).toHaveValue(title);
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "idle",
    );
    await expect(pageB.getByRole("dialog")).toHaveCount(0);
  });

  test("a same-browser broadcast updates a clean editor with a resting caret", async ({
    context,
    page: pageA,
  }) => {
    const pageId = FIXTURES.focusedPassiveBroadcast.id;
    const editPath = `/wiki/${pageId}`;
    const remoteTitle = `Focused passive broadcast ${Date.now()}`;
    const continuedTitle = `${remoteTitle} continued`;

    await loginAsAdmin(pageA);
    await pageA.goto(editPath);
    await waitForHydratedWikiEditor(pageA);
    const pageB = await context.newPage();
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
    await pageB.getByLabel("页面标题").click();

    await pageA.getByLabel("页面标题").fill(remoteTitle);
    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await expect(pageB.getByLabel("页面标题")).toHaveValue(remoteTitle, {
      timeout: 5_000,
    });
    await pageB.getByLabel("页面标题").fill(continuedTitle);
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(pageB.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
      0,
    );
  });

  test("a focused clean editor polls a remote update before its next edit", async ({
    browser,
  }) => {
    const pageId = FIXTURES.passiveDeviceSync.id;
    const title = `Passive device sync ${Date.now()}`;
    const nextTitle = `${title} continued`;
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

    await pageA.getByLabel("页面标题").fill(title);
    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await expect(pageB.getByLabel("页面标题")).toHaveValue(title, {
      timeout: 10_000,
    });
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "idle",
    );
    await expect(pageB.getByRole("dialog")).toHaveCount(0);

    await pageB.getByLabel("页面标题").fill(nextTitle);
    await pageB.keyboard.press("Control+s");
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(pageB.getByRole("dialog")).toHaveCount(0);

    await contextA.close();
    await contextB.close();
  });

  test("a clean editor with a resting caret adopts a routine poll before editing", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const pageId = FIXTURES.focusedPassivePolling.id;
    const editPath = `/wiki/${pageId}`;
    const remoteTitle = `Focused passive poll ${Date.now()}`;
    const continuedTitle = `${remoteTitle} continued`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    let heldPolling:
      | Awaited<ReturnType<typeof holdNextPollingRequestUntilReleased>>
      | undefined;

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(editPath);
      await waitForHydratedWikiEditor(pageA);
      await loginAsAdmin(pageB);
      await pageB.goto(editPath);
      await waitForHydratedWikiEditor(pageB);
      const pollingAction = await captureWikiPollingAction(pageB, pageId);

      await pageB.getByLabel("页面标题").click();
      await expect
        .poll(() =>
          pageB.evaluate(() => {
            const shell = document.querySelector(
              '[data-testid="wiki-editor-shell"]',
            );
            return Boolean(shell?.contains(document.activeElement));
          }),
        )
        .toBe(true);

      heldPolling = await holdNextPollingRequestUntilReleased(
        pageB,
        editPath,
        pollingAction,
      );
      await heldPolling.seen;

      await pageA.getByLabel("页面标题").fill(remoteTitle);
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      heldPolling.release();
      await expect(pageB.getByLabel("页面标题")).toHaveValue(remoteTitle, {
        timeout: 10_000,
      });
      await expect(pageB.getByRole("dialog")).toHaveCount(0);

      await pageB.getByLabel("页面标题").fill(continuedTitle);
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(pageB.getByRole("dialog")).toHaveCount(0);
    } finally {
      heldPolling?.release();
      await contextA.close();
      await contextB.close();
    }
  });

  test("focus polling fences input until the newest revision is applied", async ({
    browser,
  }) => {
    const pageId = FIXTURES.focusPollingFence.id;
    const editPath = `/wiki/${pageId}`;
    const remoteTitle = `Focus polling remote ${Date.now()}`;
    const continuedTitle = `${remoteTitle} continued`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    let heldPolling:
      | Awaited<ReturnType<typeof holdNextPollingRequestUntilReleased>>
      | undefined;

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(editPath);
      await waitForHydratedWikiEditor(pageA);
      await loginAsAdmin(pageB);
      await pageB.goto(editPath);
      await waitForHydratedWikiEditor(pageB);
      const pollingAction = await captureWikiPollingAction(pageB, pageId);

      await pageA.getByLabel("页面标题").fill(remoteTitle);
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      heldPolling = await holdNextPollingRequestUntilReleased(
        pageB,
        editPath,
        pollingAction,
      );
      await pageB.evaluate(() => window.dispatchEvent(new Event("focus")));
      await heldPolling.seen;

      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "inert",
        "",
      );

      const pollingResponse = pageB.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.request().headers()["next-action"] === pollingAction &&
          new URL(response.url()).pathname === editPath,
      );
      heldPolling.release();
      await pollingResponse;

      await expect(pageB.getByLabel("页面标题")).toHaveValue(remoteTitle);
      await expect(pageB.getByTestId("wiki-editor-shell")).not.toHaveAttribute(
        "inert",
        "",
      );

      await pageB.getByLabel("页面标题").fill(continuedTitle);
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(pageB.getByRole("dialog")).toHaveCount(0);
    } finally {
      heldPolling?.release();
      await contextA.close();
      await contextB.close();
    }
  });

  test("a failed focus poll releases its interaction fence", async ({
    page,
  }) => {
    const pageId = FIXTURES.focusPollingFailure.id;
    const editPath = `/wiki/${pageId}`;
    const title = `Focus polling retry ${Date.now()}`;
    let heldPolling:
      | Awaited<ReturnType<typeof holdNextPollingRequestUntilReleased>>
      | undefined;

    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);

    try {
      heldPolling = await holdNextPollingRequestUntilReleased(
        page,
        editPath,
        pollingAction,
        "abort",
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await heldPolling.seen;
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "inert",
        "",
      );

      heldPolling.release();
      await expect(page.getByTestId("wiki-editor-shell")).not.toHaveAttribute(
        "inert",
        "",
      );
      await page.getByLabel("页面标题").fill(title);
      await page.keyboard.press("Control+s");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      heldPolling?.release();
    }
  });

  test("routine background polling never freezes active typing", async ({
    page,
  }) => {
    const pageId = FIXTURES.backgroundPolling.id;
    const editPath = `/wiki/${pageId}`;
    const title = `Typing during background poll ${Date.now()}`;
    let heldPolling:
      | Awaited<ReturnType<typeof holdNextPollingRequestUntilReleased>>
      | undefined;

    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);

    try {
      heldPolling = await holdNextPollingRequestUntilReleased(
        page,
        editPath,
        pollingAction,
      );
      await heldPolling.seen;
      await expect(page.getByTestId("wiki-editor-shell")).not.toHaveAttribute(
        "inert",
        "",
      );
      await page.getByLabel("页面标题").fill(title);

      heldPolling.release();
      await page.keyboard.press("Control+s");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      heldPolling?.release();
    }
  });

  test("a background update cannot consume an active selection before formatting", async ({
    page,
  }) => {
    const pageId = FIXTURES.selectionDuringPolling.id;
    const editPath = `/wiki/${pageId}`;
    const remoteContent = JSON.stringify([
      {
        type: "p",
        children: [{ text: "Alpha block.", italic: true }],
      },
      { type: "p", children: [{ text: "Beta block." }] },
      { type: "p", children: [{ text: "Gamma block." }] },
    ]);
    let heldPolling:
      | Awaited<ReturnType<typeof holdNextPollingRequestUntilReleased>>
      | undefined;

    try {
      await loginAsAdmin(page);
      await page.goto(editPath);
      await waitForHydratedWikiEditor(page);
      const pollingAction = await captureWikiPollingAction(page, pageId);
      heldPolling = await holdNextPollingRequestUntilReleased(
        page,
        editPath,
        pollingAction,
      );
      await heldPolling.seen;

      await writeRemoteContent(pageId, remoteContent);
      await selectText(page, "Alpha block.");
      await expect
        .poll(() =>
          page.evaluate(() => window.getSelection()?.toString() ?? ""),
        )
        .toBe("Alpha block.");
      const pollingResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.request().headers()["next-action"] === pollingAction &&
          new URL(response.url()).pathname === editPath,
      );
      heldPolling.release();
      await pollingResponse;
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );

      await expect
        .poll(() =>
          page.evaluate(() => window.getSelection()?.toString() ?? ""),
        )
        .toBe("Alpha block.");
      await page.keyboard.press("Control+b");
      await expect(
        page
          .locator('[role="textbox"] strong')
          .filter({ hasText: "Alpha block." }),
      ).toBeVisible();
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
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
    } finally {
      heldPolling?.release();
    }
  });

  test("a remote update never overwrites a dirty same-browser tab", async ({
    context,
    page: pageA,
  }) => {
    const pageId = FIXTURES.dirtyTabSync.id;
    const remoteTitle = `Remote title ${Date.now()}`;
    const localTitle = `Unsaved local title ${Date.now()}`;

    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageA);
    const pageB = await context.newPage();
    await pageB.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(pageB);

    await pageB.getByLabel("页面标题").fill(localTitle);
    await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "unsaved",
    );
    await pageA.getByLabel("页面标题").fill(remoteTitle);
    await pageA.keyboard.press("Control+s");
    await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await expect(pageB.getByLabel("页面标题")).toHaveValue(localTitle);
  });

  test("cross-device polling cannot overwrite an in-flight local edit", async ({
    browser,
  }) => {
    const pageId = FIXTURES.dirtyDeviceSync.id;
    const markerA = `remote-device-${Date.now()}`;
    const markerB = `local-device-${Date.now()}`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    let releaseLocalSave!: () => void;
    let markLocalSaveSeen!: () => void;
    const localSaveGate = new Promise<void>((resolve) => {
      releaseLocalSave = resolve;
    });
    const localSaveSeen = new Promise<void>((resolve) => {
      markLocalSaveSeen = resolve;
    });

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(`/wiki/${pageId}`);
      const editorA = await waitForHydratedWikiEditor(pageA);
      await loginAsAdmin(pageB);
      await pageB.goto(`/wiki/${pageId}`);
      const editorB = await waitForHydratedWikiEditor(pageB);
      const pollingAction = await captureWikiPollingAction(pageB, pageId);

      await pageB.bringToFront();
      await expect(editorB).toHaveAttribute("contenteditable", "true");
      const localBlock = editorB
        .locator('[data-slate-node="text"]')
        .filter({ hasText: "Alpha block." })
        .first();
      await localBlock.click();
      await pageB.keyboard.press("End");
      await pageB.keyboard.type(` ${markerB}`);
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "unsaved",
      );
      let held = false;
      await pageB.route(`**/wiki/${pageId}`, async (route) => {
        if (
          route.request().method() !== "POST" ||
          route.request().headers()["next-action"] === pollingAction ||
          held
        ) {
          await route.continue();
          return;
        }
        held = true;
        markLocalSaveSeen();
        await localSaveGate;
        await route.continue();
      });
      await pageB.keyboard.press("Control+s");
      await localSaveSeen;

      await pageA.bringToFront();
      await expect(editorA).toHaveAttribute("contenteditable", "true");
      const remoteBlock = editorA
        .locator('[data-slate-node="text"]')
        .filter({ hasText: "Beta block." })
        .first();
      await remoteBlock.click();
      await pageA.keyboard.press("End");
      await pageA.keyboard.type(` ${markerA}`);
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      await pageB.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(editorB).toContainText(markerB);
      await expect(editorB).not.toContainText(markerA);

      releaseLocalSave();
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(editorB).toContainText(markerA);
      await expect(editorB).toContainText(markerB);
      await expect(pageB.getByRole("dialog")).toHaveCount(0);
    } finally {
      releaseLocalSave();
      await contextA.close();
      await contextB.close();
    }
  });
});
