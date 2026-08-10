import { expect, test, type Route } from "@playwright/test";

import {
  cleanupWikiAutosaveFixtures,
  FIXTURES,
  appendAfterText,
  selectAndFormatText,
  formatText,
  formatTextWithDomSelection,
  readPersistedContent,
  writeRemoteContent,
  readLocalDraftSnapshot,
  holdFirstSaveUntilReleased,
  loginAsAdmin,
  captureWikiPollingAction,
  waitForHydratedWikiEditor,
  provisionWikiAutosaveFixtures,
} from "./helpers/wiki-edit-autosave";

test.beforeAll(provisionWikiAutosaveFixtures);
test.afterAll(cleanupWikiAutosaveFixtures);

test.describe("#432 autosave recovery and receipt replay", () => {
  test("refreshing before autosave silently restores and persists the local edit", async ({
    page,
  }) => {
    const pageId = FIXTURES.refreshRecovery.id;
    const title = `Refresh recovery ${Date.now()}`;

    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(page);

    await page.getByLabel("页面标题").fill(title);
    await expect
      .poll(async () => (await readLocalDraftSnapshot(page, pageId))?.title)
      .toBe(title);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    await waitForHydratedWikiEditor(page);

    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("页面标题")).toHaveValue(title);
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await page.reload();
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toHaveValue(title);
  });

  test("recovery finishes before the editor accepts new input", async ({
    page,
  }) => {
    const pageId = FIXTURES.bootRecovery.id;
    const recoveredTitle = `Boot recovery ${Date.now()}`;

    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(page);
    await page.getByLabel("页面标题").fill(recoveredTitle);
    await expect
      .poll(async () => (await readLocalDraftSnapshot(page, pageId))?.title)
      .toBe(recoveredTitle);

    await page.addInitScript((expectedRecoveredTitle) => {
      const lockManager = navigator.locks;
      const originalRequest = lockManager.request.bind(lockManager);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const recoveryViolations: string[] = [];
      const observeRecoveryInvariant = () => {
        const shell = document.querySelector<HTMLElement>(
          '[data-testid="wiki-editor-shell"]',
        );
        const title = document.querySelector<HTMLInputElement>(
          'input[aria-label="页面标题"]',
        );
        if (
          shell &&
          title &&
          !shell.hasAttribute("inert") &&
          title.value !== expectedRecoveredTitle
        ) {
          recoveryViolations.push(title.value);
        }
      };
      new MutationObserver(observeRecoveryInvariant).observe(document, {
        attributes: true,
        childList: true,
        subtree: true,
      });

      const heldFrames = new Map<number, FrameRequestCallback>();
      const originalRequestAnimationFrame =
        window.requestAnimationFrame.bind(window);
      const originalCancelAnimationFrame =
        window.cancelAnimationFrame.bind(window);
      let nextHeldFrameId = 2_000_000_000;
      let captureRecoveryFrames = false;
      let recoveryFramesReleased = false;
      const objectStorePrototype = IDBObjectStore.prototype;
      const originalGet = objectStorePrototype.get;
      Object.defineProperty(objectStorePrototype, "get", {
        configurable: true,
        writable: true,
        value(this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
          if (this.name === "drafts" && typeof query === "string") {
            captureRecoveryFrames = true;
          }
          return originalGet.call(this, query);
        },
      });
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        if (captureRecoveryFrames && !recoveryFramesReleased) {
          const frameId = nextHeldFrameId++;
          heldFrames.set(frameId, callback);
          document.documentElement.dataset.recoveryFrameHeld = "true";
          return frameId;
        }
        return originalRequestAnimationFrame(callback);
      };
      window.cancelAnimationFrame = (frameId: number) => {
        if (heldFrames.delete(frameId)) return;
        originalCancelAnimationFrame(frameId);
      };
      const releaseRecoveryFrames = () => {
        recoveryFramesReleased = true;
        const callbacks = [...heldFrames.values()];
        heldFrames.clear();
        delete document.documentElement.dataset.recoveryFrameHeld;
        for (const callback of callbacks) {
          originalRequestAnimationFrame(callback);
        }
      };
      Object.assign(window, {
        __releaseWikiDraftBoot: release,
        __releaseWikiDraftRecoveryFrames: releaseRecoveryFrames,
        __wikiDraftRecoveryViolations: recoveryViolations,
      });
      Object.defineProperty(lockManager, "request", {
        configurable: true,
        value: (
          name: string,
          options: LockOptions,
          callback: LockGrantedCallback<void>,
        ) => gate.then(() => originalRequest(name, options, callback)),
      });
    }, recoveredTitle);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    const shell = page.getByTestId("wiki-editor-shell");
    await expect(shell).toBeVisible();
    await expect(page.getByLabel("页面标题")).toBeDisabled();
    await expect(shell).not.toHaveAttribute("data-editor-hydrated", "true");

    await page.evaluate(() => {
      const bootWindow = window as typeof window & {
        __releaseWikiDraftBoot: () => void;
      };
      bootWindow.__releaseWikiDraftBoot();
    });
    await expect
      .poll(() =>
        page.evaluate((expectedRecoveredTitle) => {
          const title = document.querySelector<HTMLInputElement>(
            'input[aria-label="页面标题"]',
          );
          return (
            document.documentElement.dataset.recoveryFrameHeld === "true" ||
            title?.value === expectedRecoveredTitle
          );
        }, recoveredTitle),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => {
        const bootWindow = window as typeof window & {
          __wikiDraftRecoveryViolations: string[];
        };
        return bootWindow.__wikiDraftRecoveryViolations;
      }),
    ).toEqual([]);
    await page.evaluate(() => {
      const bootWindow = window as typeof window & {
        __releaseWikiDraftRecoveryFrames: () => void;
      };
      bootWindow.__releaseWikiDraftRecoveryFrames();
    });
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toBeEnabled();
    await expect(page.getByLabel("页面标题")).toHaveValue(recoveredTitle);
    expect(
      await page.evaluate(() => {
        const bootWindow = window as typeof window & {
          __wikiDraftRecoveryViolations: string[];
        };
        return bootWindow.__wikiDraftRecoveryViolations;
      }),
    ).toEqual([]);
  });

  test("a remote revision waits for the boot recovery decision before adoption", async ({
    browser,
  }) => {
    const fixture = FIXTURES.bootRemoteSync;
    const remoteTitle = `Boot remote sync ${Date.now()}`;
    const contextB = await browser.newContext();
    await contextB.addInitScript(() => {
      const lockManager = navigator.locks;
      const originalRequest = lockManager.request.bind(lockManager);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      Object.assign(window, { __releaseWikiDraftBoot: release });
      Object.defineProperty(lockManager, "request", {
        configurable: true,
        value: (
          name: string,
          options: LockOptions,
          callback: LockGrantedCallback<void>,
        ) => gate.then(() => originalRequest(name, options, callback)),
      });
    });
    const pageB = await contextB.newPage();
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    try {
      await loginAsAdmin(pageB);
      await pageB.goto(`/wiki/${fixture.id}`);
      await expect(pageB.getByTestId("wiki-editor-shell")).toBeVisible();
      await expect(pageB.getByLabel("页面标题")).toBeDisabled();

      await loginAsAdmin(pageA);
      await pageA.goto(`/wiki/${fixture.id}`);
      await waitForHydratedWikiEditor(pageA);
      await pageA.getByLabel("页面标题").fill(remoteTitle);
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      const updateCheck = pageB.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === `/wiki/${fixture.id}`,
      );
      await pageB.evaluate(() => window.dispatchEvent(new Event("focus")));
      await updateCheck;
      await pageB.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(pageB.getByLabel("页面标题")).toHaveValue(fixture.title);

      await pageB.evaluate(() => {
        const bootWindow = window as typeof window & {
          __releaseWikiDraftBoot: () => void;
        };
        bootWindow.__releaseWikiDraftBoot();
      });
      await waitForHydratedWikiEditor(pageB);
      await expect(pageB.getByLabel("页面标题")).toHaveValue(remoteTitle);
      await expect(pageB.getByRole("dialog")).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("formatting survives a refresh before autosave without a recovery prompt", async ({
    page,
  }) => {
    const pageId = FIXTURES.formattingRefresh.id;
    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(page);

    await formatText(page, "Alpha block.", "Control+b");
    await expect(
      page
        .locator('[role="textbox"] strong')
        .filter({ hasText: "Alpha block." }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const draft = await readLocalDraftSnapshot(page, pageId);
        return Boolean(
          draft?.content.includes("Alpha block.") &&
          draft.content.includes('\"bold\":true'),
        );
      })
      .toBe(true);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    const editor = await waitForHydratedWikiEditor(page);

    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(
      editor.locator("strong").filter({ hasText: "Alpha block." }),
    ).toBeVisible();
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
  });

  test("refreshing after a committed response loss rebases and persists the trailing edit", async ({
    page,
  }) => {
    const pageId = FIXTURES.refreshAfterCommit.id;
    const editPath = `/wiki/${pageId}`;
    const committedTitle = `Committed before refresh ${Date.now()}`;
    const finalTitle = `${committedTitle} trailing`;
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
    await expect
      .poll(async () => (await readLocalDraftSnapshot(page, pageId))?.title)
      .toBe(finalTitle);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    await waitForHydratedWikiEditor(page);

    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("页面标题")).toHaveValue(finalTitle);
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await page.reload();
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toHaveValue(finalTitle);
  });

  test("a receipt replay rebases a trailing block edit on its exact committed baseline", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const pageId = FIXTURES.receiptTailRebase.id;
    const editPath = `/wiki/${pageId}`;
    let markCommitted!: () => void;
    const committed = new Promise<void>((resolve) => {
      markCommitted = resolve;
    });
    let firstSave = true;

    await loginAsAdmin(page);
    await page.goto(editPath);
    const editor = await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    const dropSaveResponses = async (route: Route) => {
      if (
        route.request().method() !== "POST" ||
        route.request().headers()["next-action"] === pollingAction
      ) {
        await route.continue();
        return;
      }
      if (firstSave) {
        firstSave = false;
        await route.fetch();
        markCommitted();
      }
      await route.abort("failed");
    };
    await page.route(`**${editPath}`, dropSaveResponses);

    await formatText(page, "Alpha block.", "Control+b");
    await committed;
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "error",
    );
    await selectAndFormatText(page, "Beta block.", "Control+i");
    await expect(
      editor.locator("em").filter({ hasText: "Beta block." }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const draft = await readLocalDraftSnapshot(page, pageId);
        return Boolean(
          draft?.content.includes("Beta block.") &&
          draft.content.includes('"italic":true'),
        );
      })
      .toBe(true);

    await writeRemoteContent(
      pageId,
      JSON.stringify([
        {
          type: "p",
          children: [{ text: "Alpha block.", italic: true }],
        },
        { type: "p", children: [{ text: "Beta block." }] },
        { type: "p", children: [{ text: "Gamma block." }] },
      ]),
    );
    await page.unroute(`**${editPath}`, dropSaveResponses);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    const recovered = await waitForHydratedWikiEditor(page);

    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(0);
    await expect(
      recovered.locator("em").filter({ hasText: "Alpha block." }),
    ).toBeVisible();
    await expect(
      recovered.locator("em").filter({ hasText: "Beta block." }),
    ).toBeVisible();
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 20_000 },
    );
    await expect
      .poll(() => readPersistedContent(pageId))
      .toMatchObject([
        {
          type: "p",
          children: [{ text: "Alpha block.", italic: true }],
        },
        {
          type: "p",
          children: [{ text: "Beta block.", italic: true }],
        },
        { type: "p", children: [{ text: "Gamma block." }] },
      ]);
  });

  test("a clean-merge receipt rebases its tail before a later writer", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const pageId = FIXTURES.cleanMergeReceiptTailRebase.id;
    const editPath = `/wiki/${pageId}`;
    const submittedMarker = `submitted-alpha-${Date.now()}`;
    const remoteMarker = `remote-beta-${Date.now()}`;
    const trailingMarker = `trailing-gamma-${Date.now()}`;
    const laterWriterMarker = `later-writer-alpha-${Date.now()}`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    let markFirstCommitted!: () => void;
    const firstCommitted = new Promise<void>((resolve) => {
      markFirstCommitted = resolve;
    });

    try {
      await loginAsAdmin(pageA);
      await pageA.goto(editPath);
      await waitForHydratedWikiEditor(pageA);
      const pollingAction = await captureWikiPollingAction(pageA, pageId);
      let firstSave = true;
      const dropSaveResponses = async (route: Route) => {
        if (
          route.request().method() !== "POST" ||
          route.request().headers()["next-action"] === pollingAction
        ) {
          await route.continue();
          return;
        }
        if (firstSave) {
          firstSave = false;
          await route.fetch();
          markFirstCommitted();
        }
        await route.abort("failed");
      };
      await pageA.route(`**${editPath}`, dropSaveResponses);

      await loginAsAdmin(pageB);
      await pageB.goto(editPath);
      await waitForHydratedWikiEditor(pageB);
      await appendAfterText(pageB, "Beta block.", remoteMarker);
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      await appendAfterText(pageA, "Alpha block.", submittedMarker);
      await firstCommitted;
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "error",
      );
      await appendAfterText(pageA, "Gamma block.", trailingMarker);
      await expect
        .poll(async () =>
          (await readLocalDraftSnapshot(pageA, pageId))?.content.includes(
            trailingMarker,
          ),
        )
        .toBe(true);

      const afterCleanMerge = await readPersistedContent(pageId);
      const alpha = afterCleanMerge[0] as {
        children: Array<Record<string, unknown>>;
      };
      alpha.children = [{ text: `Alpha block. ${laterWriterMarker}` }];
      await writeRemoteContent(pageId, JSON.stringify(afterCleanMerge));

      await pageA.unroute(`**${editPath}`, dropSaveResponses);
      pageA.once("dialog", (dialog) => void dialog.accept());
      await pageA.reload();
      const recovered = await waitForHydratedWikiEditor(pageA);

      await expect(
        pageA.getByRole("dialog", { name: "恢复本地草稿" }),
      ).toHaveCount(0);
      await expect(pageA.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(
        0,
      );
      // The receipt must first rebase the unsent Gamma tail onto the exact
      // clean-merged result (which contains Beta). This separates receipt-tail
      // recovery from the subsequent merge against the later Alpha writer.
      await expect(recovered).toContainText(remoteMarker, { timeout: 15_000 });
      await expect(recovered).toContainText(trailingMarker);
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 20_000 },
      );
      await expect(recovered).toContainText(laterWriterMarker);
      await expect(recovered).toContainText(remoteMarker);
      await expect(recovered).toContainText(trailingMarker);
      await expect(recovered).not.toContainText(submittedMarker);
      await expect
        .poll(async () => JSON.stringify(await readPersistedContent(pageId)))
        .not.toContain(submittedMarker);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("refreshing before an in-flight save commits replays it before the trailing edit", async ({
    page,
  }) => {
    test.slow();
    const pageId = FIXTURES.refreshBeforeCommit.id;
    const editPath = `/wiki/${pageId}`;
    const submittedTitle = `Submitted before reload ${Date.now()}`;
    const finalTitle = `${submittedTitle} trailing`;

    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    const firstSave = await holdFirstSaveUntilReleased(
      page,
      editPath,
      pollingAction,
    );

    await page.getByLabel("页面标题").fill(submittedTitle);
    await firstSave.seen;
    await page.getByLabel("页面标题").fill(finalTitle);
    await expect
      .poll(async () => (await readLocalDraftSnapshot(page, pageId))?.title)
      .toBe(finalTitle);

    const staleReloadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === editPath,
    );
    page.once("dialog", (dialog) => void dialog.accept());
    const reload = page.reload();
    await staleReloadResponse;
    firstSave.release();
    await Promise.all([reload, firstSave.committed]);
    await waitForHydratedWikiEditor(page);

    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("页面标题")).toHaveValue(finalTitle);
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(0);

    await page.reload();
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toHaveValue(finalTitle);
  });

  test("refreshing before commit preserves the pending edit summary and trailing edit", async ({
    page,
  }) => {
    test.slow();
    const pageId = FIXTURES.refreshSummaryBeforeCommit.id;
    const editPath = `/wiki/${pageId}`;
    const summary = `Refresh summary ${Date.now()}`;
    const submittedTitle = `Summary submitted ${Date.now()}`;
    const finalTitle = `${submittedTitle} trailing`;

    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    const firstSave = await holdFirstSaveUntilReleased(
      page,
      editPath,
      pollingAction,
    );

    await page.getByRole("button", { name: "页面设置" }).click();
    await page
      .getByRole("dialog", { name: "页面设置" })
      .getByRole("textbox", { name: "编辑摘要（可选）" })
      .fill(summary);
    await page.keyboard.press("Escape");
    await page.getByLabel("页面标题").fill(submittedTitle);
    await page.keyboard.press("Control+s");
    await firstSave.seen;

    await page.getByLabel("页面标题").fill(finalTitle);
    await expect
      .poll(async () => {
        const draft = await readLocalDraftSnapshot(page, pageId);
        return { title: draft?.title, editSummary: draft?.editSummary };
      })
      .toEqual({ title: finalTitle, editSummary: summary });

    const staleReloadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === editPath,
    );
    page.once("dialog", (dialog) => void dialog.accept());
    const reload = page.reload();
    await staleReloadResponse;
    firstSave.release();
    await Promise.all([reload, firstSave.committed]);
    await waitForHydratedWikiEditor(page);

    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(0);
    await expect(page.getByLabel("页面标题")).toHaveValue(finalTitle);
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 20_000 },
    );

    await page.goto(`/wiki/history/${pageId}`);
    await expect(page.getByText(summary, { exact: false })).toBeVisible();
  });

  test("refreshing retries a summary-only save whose request never reached the server", async ({
    page,
  }) => {
    const pageId = FIXTURES.refreshSummaryOnlyRetry.id;
    const editPath = `/wiki/${pageId}`;
    const summary = `Summary-only retry ${Date.now()}`;
    let markAttempted!: () => void;
    const attempted = new Promise<void>((resolve) => {
      markAttempted = resolve;
    });
    let abortedFirstSave = false;

    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);
    await page.route(`**${editPath}`, async (route) => {
      if (
        route.request().method() !== "POST" ||
        route.request().headers()["next-action"] === pollingAction ||
        abortedFirstSave
      ) {
        await route.continue();
        return;
      }
      abortedFirstSave = true;
      markAttempted();
      await route.abort("failed");
    });

    await page.getByRole("button", { name: "页面设置" }).click();
    await page
      .getByRole("dialog", { name: "页面设置" })
      .getByRole("textbox", { name: "编辑摘要（可选）" })
      .fill(summary);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+s");
    await attempted;
    await expect
      .poll(
        async () => (await readLocalDraftSnapshot(page, pageId))?.editSummary,
      )
      .toBe(summary);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    await waitForHydratedWikiEditor(page);

    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );
    await page.goto(`/wiki/history/${pageId}`);
    await expect(page.getByText(summary, { exact: false })).toBeVisible();
  });

  test("reverted formatting survives reload when the superseded save commits late", async ({
    page,
  }) => {
    test.slow();
    const fixture = FIXTURES.refreshUndoBeforeCommit;
    const editPath = `/wiki/${fixture.id}`;

    await loginAsAdmin(page);
    await page.goto(editPath);
    const editor = await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, fixture.id);
    const firstSave = await holdFirstSaveUntilReleased(
      page,
      editPath,
      pollingAction,
    );

    await formatText(page, "Alpha block.", "Control+b");
    await firstSave.seen;
    await formatTextWithDomSelection(page, "Alpha block.", "Control+b");
    await expect(
      editor.locator("strong").filter({ hasText: "Alpha block." }),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const draft = await readLocalDraftSnapshot(page, fixture.id);
        return Boolean(
          draft?.content.includes("Alpha block.") &&
          !draft.content.includes('\"bold\":true'),
        );
      })
      .toBe(true);

    const staleReloadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === editPath,
    );
    page.once("dialog", (dialog) => void dialog.accept());
    const reload = page.reload();
    await staleReloadResponse;
    firstSave.release();
    await Promise.all([reload, firstSave.committed]);
    const recoveredEditor = await waitForHydratedWikiEditor(page);

    await expect(
      recoveredEditor.locator("strong").filter({ hasText: "Alpha block." }),
    ).toHaveCount(0);
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 20_000 },
    );
    await expect(page.getByRole("dialog", { name: "编辑冲突" })).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);

    await page.reload();
    const persistedEditor = await waitForHydratedWikiEditor(page);
    await expect(
      persistedEditor.locator("strong").filter({ hasText: "Alpha block." }),
    ).toHaveCount(0);
  });
});
