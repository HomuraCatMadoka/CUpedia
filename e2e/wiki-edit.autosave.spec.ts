import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { loginAsAdmin } from "./helpers/auth";
import {
  captureWikiPollingAction,
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
  failure: {
    id: randomUUID(),
    title: "Autosave failure fixture",
  },
  passiveConflict: {
    id: randomUUID(),
    title: "Autosave passive conflict fixture",
  },
  titleConflict: {
    id: randomUUID(),
    title: "Autosave title conflict fixture",
  },
  conflictReturnRefresh: {
    id: randomUUID(),
    title: "Autosave conflict return refresh fixture",
  },
  formattingMerge: {
    id: randomUUID(),
    title: "Autosave formatting merge fixture",
  },
  immediateNavigation: {
    id: randomUUID(),
    title: "Autosave immediate navigation fixture",
  },
  inFlightFormatting: {
    id: randomUUID(),
    title: "Autosave in-flight formatting fixture",
  },
  unknownOutcome: {
    id: randomUUID(),
    title: "Autosave unknown outcome fixture",
  },
  refreshRecovery: {
    id: randomUUID(),
    title: "Autosave refresh recovery fixture",
  },
  bootRecovery: {
    id: randomUUID(),
    title: "Autosave boot recovery fixture",
  },
  bootRemoteSync: {
    id: randomUUID(),
    title: "Autosave boot remote sync fixture",
  },
  topologyParent: {
    id: randomUUID(),
    title: "Autosave topology parent fixture",
  },
  topologyChild: {
    id: randomUUID(),
    title: "Autosave topology child fixture",
  },
  topologyOtherParent: {
    id: randomUUID(),
    title: "Autosave topology other parent fixture",
  },
  refreshAfterCommit: {
    id: randomUUID(),
    title: "Autosave refresh after commit fixture",
  },
  refreshBeforeCommit: {
    id: randomUUID(),
    title: "Autosave refresh before commit fixture",
  },
  refreshSummaryBeforeCommit: {
    id: randomUUID(),
    title: "Autosave refresh summary before commit fixture",
  },
  refreshSummaryOnlyRetry: {
    id: randomUUID(),
    title: "Autosave refresh summary-only retry fixture",
  },
  refreshUndoBeforeCommit: {
    id: randomUUID(),
    title: "Autosave refresh undo before commit fixture",
  },
  passiveTabSync: {
    id: randomUUID(),
    title: "Autosave passive tab sync fixture",
  },
  passiveDeviceSync: {
    id: randomUUID(),
    title: "Autosave passive device sync fixture",
  },
  dirtyTabSync: {
    id: randomUUID(),
    title: "Autosave dirty tab sync fixture",
  },
  dirtyDeviceSync: {
    id: randomUUID(),
    title: "Autosave dirty device sync fixture",
  },
  formattingRefresh: {
    id: randomUUID(),
    title: "Autosave formatting refresh fixture",
  },
  mergeTrailingRefresh: {
    id: randomUUID(),
    title: "Autosave merge trailing refresh fixture",
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

    const topologyContent = JSON.stringify([
      {
        type: "p",
        children: [
          {
            type: "a",
            pageId: FIXTURES.topologyChild.id,
            url: `/wiki/${FIXTURES.topologyChild.id}`,
            children: [{ text: FIXTURES.topologyChild.title }],
          },
        ],
      },
      { type: "p", children: [{ text: "Topology parent body." }] },
    ]);
    await client.query("update wiki_pages set content = $1 where id = $2", [
      topologyContent,
      FIXTURES.topologyParent.id,
    ]);
    await client.query("update wiki_pages set parent_id = $1 where id = $2", [
      FIXTURES.topologyParent.id,
      FIXTURES.topologyChild.id,
    ]);
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

async function appendAfterText(
  page: Page,
  anchor: string,
  marker: string,
  expectedStatus: "unsaved" | "saving" = "unsaved",
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
  await page.keyboard.type(` ${marker}`);

  await expect(editor).toContainText(marker);
  await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
    "data-autosave-status",
    expectedStatus,
  );
}

async function selectAndFormatText(page: Page, text: string, shortcut: string) {
  const editor = page.locator('[role="textbox"]').first();
  const textNode = editor
    .locator('[data-slate-node="text"]')
    .filter({ hasText: text })
    .first();
  await expect(textNode).toBeVisible();
  const points = await textNode.evaluate((element, needle) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.includes(needle)) {
      node = walker.nextNode();
    }
    if (!node?.textContent) throw new Error(`Text not found: ${needle}`);
    const offset = node.textContent.indexOf(needle);
    const start = document.createRange();
    start.setStart(node, offset);
    start.setEnd(node, offset + 1);
    const startRect = start.getBoundingClientRect();
    const end = document.createRange();
    end.setStart(node, offset + needle.length - 1);
    end.setEnd(node, offset + needle.length);
    const endRect = end.getBoundingClientRect();
    return {
      start: { x: startRect.left + 1, y: startRect.top + startRect.height / 2 },
      end: { x: endRect.right - 1, y: endRect.top + endRect.height / 2 },
    };
  }, text);
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe(text);
  await page.keyboard.press(shortcut);
}

async function formatText(page: Page, text: string, shortcut: string) {
  await selectAndFormatText(page, text, shortcut);
  await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
    "data-autosave-status",
    "unsaved",
  );
}

async function formatTextWithDomSelection(
  page: Page,
  text: string,
  shortcut: string,
) {
  const textNode = page
    .locator('[role="textbox"] [data-slate-node="text"]')
    .filter({ hasText: text })
    .first();
  await textNode.evaluate((element, needle) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.includes(needle)) {
      node = walker.nextNode();
    }
    if (!node?.textContent) throw new Error(`Text not found: ${needle}`);
    const offset = node.textContent.indexOf(needle);
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset + needle.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, text);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe(text);
  await page.keyboard.press(shortcut);
}

async function readPersistedContent(pageId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ content: string }>(
      "select content from wiki_pages where id = $1",
      [pageId],
    );
    return JSON.parse(result.rows[0]!.content) as unknown[];
  } finally {
    await client.end();
  }
}

async function readLocalDraftSnapshot(page: Page, pageId: string) {
  return page.evaluate(async (targetPageId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("cupedia-wiki-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<
        Array<{ pageId: string; draftSnapshot: string; updatedAt: number }>
      >((resolve, reject) => {
        const transaction = database.transaction("drafts", "readonly");
        const request = transaction.objectStore("drafts").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const latest = records
        .filter((record) => record.pageId === targetPageId)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (!latest) return null;
      return JSON.parse(latest.draftSnapshot) as {
        title: string;
        content: string;
        editSummary: string;
      };
    } finally {
      database.close();
    }
  }, pageId);
}

async function waitForDraftResume(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function holdFirstSaveUntilReleased(
  page: Page,
  editPath: string,
  pollingAction: string,
) {
  let release!: () => void;
  let markSeen!: () => void;
  let markCommitted!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    markSeen = resolve;
  });
  const committed = new Promise<void>((resolve) => {
    markCommitted = resolve;
  });
  let held = false;

  await page.route(`**${editPath}`, async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().headers()["next-action"] === pollingAction ||
      held
    ) {
      await route.continue();
      return;
    }
    held = true;
    markSeen();
    await released;
    await route.fetch();
    markCommitted();
    await route.abort("failed").catch(() => {});
  });

  return { release, seen, committed };
}

async function holdFirstSaveRequestUntilReleased(
  page: Page,
  editPath: string,
  pollingAction: string,
) {
  let release!: () => void;
  let markSeen!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    markSeen = resolve;
  });
  let held = false;

  await page.route(`**${editPath}`, async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().headers()["next-action"] === pollingAction ||
      held
    ) {
      await route.continue();
      return;
    }
    held = true;
    markSeen();
    await gate;
    await route.continue();
  });

  return { release, seen };
}

test.describe("#432 latest draft convergence", () => {
  test("moving a child cannot make a stale parent edit delete its hidden legacy link", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      await loginAsAdmin(pageB);
      await pageB.goto(`/wiki/${FIXTURES.topologyParent.id}`);
      const parentEditor = await waitForHydratedWikiEditor(pageB);
      await expect(parentEditor).not.toContainText(
        FIXTURES.topologyChild.title,
      );

      await loginAsAdmin(pageA);
      await pageA.goto(`/wiki/${FIXTURES.topologyChild.id}`);
      await waitForHydratedWikiEditor(pageA);
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

    await page.addInitScript(() => {
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
    await waitForHydratedWikiEditor(page);
    await expect(page.getByLabel("页面标题")).toBeEnabled();
    await expect(page.getByLabel("页面标题")).toHaveValue(recoveredTitle);
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

  test("a failed recovery discard preserves the trailing draft and clean remote merge", async ({
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
    let markSecondRequestAborted!: () => void;
    const secondRequestAborted = new Promise<void>((resolve) => {
      markSecondRequestAborted = resolve;
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
        if (postCount === 2) {
          await route.abort("failed");
          markSecondRequestAborted();
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
      await secondRequestAborted;
      pageA.once("dialog", (dialog) => void dialog.accept());
      await pageA.reload();
      await waitForHydratedWikiEditor(pageA);

      await expect(
        pageA.getByRole("dialog", { name: "恢复本地草稿" }),
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
      ).toContainText("无法清除本地草稿，请重试。");
      await pageA.evaluate(() => window.dispatchEvent(new Event("pagehide")));

      expect(await readLocalDraftSnapshot(pageA, pageId)).toEqual(
        localDraftBeforeDiscard,
      );
      await expect(
        pageA.getByRole("dialog", { name: "恢复本地草稿" }),
      ).toBeVisible();
      await expect
        .poll(async () => JSON.stringify(await readPersistedContent(pageId)))
        .toContain(markerB);
    } finally {
      releaseFirstResponse();
      await contextA.close();
      await contextB.close();
    }
  });
});
