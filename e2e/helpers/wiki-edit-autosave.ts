import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

import { loginAsAdmin } from "./auth";
import { queryDatabase, withDatabaseClient } from "./database";
import {
  captureWikiPollingAction,
  createUntitledWikiPage,
  waitForHydratedWikiEditor,
  wikiPageUrl,
} from "./wiki";

const FIXTURE_CONTENT = JSON.stringify([
  { type: "p", children: [{ text: "Alpha block." }] },
  { type: "p", children: [{ text: "Beta block." }] },
  { type: "p", children: [{ text: "Gamma block." }] },
]);
export const FIXTURES = {
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
  navigationFence: {
    id: randomUUID(),
    title: "Autosave navigation fence fixture",
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
  recoveryStorageFailure: {
    id: randomUUID(),
    title: "Autosave recovery storage failure fixture",
  },
  submissionStorageFailure: {
    id: randomUUID(),
    title: "Autosave submission storage failure fixture",
  },
  settledLegacyRecovery: {
    id: randomUUID(),
    title: "Autosave settled legacy recovery fixture",
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
  topologyProjectionParent: {
    id: randomUUID(),
    title: "Autosave projection parent fixture",
  },
  topologyProjectionChild: {
    id: randomUUID(),
    title: "Autosave projection child fixture",
  },
  topologyProjectionOtherParent: {
    id: randomUUID(),
    title: "Autosave projection other parent fixture",
  },
  topologyEmptyProjectionParent: {
    id: randomUUID(),
    title: "Autosave empty projection parent fixture",
  },
  topologyEmptyProjectionChild: {
    id: randomUUID(),
    title: "Autosave empty projection child fixture",
  },
  topologyEmptyProjectionOtherParent: {
    id: randomUUID(),
    title: "Autosave empty projection other parent fixture",
  },
  refreshAfterCommit: {
    id: randomUUID(),
    title: "Autosave refresh after commit fixture",
  },
  receiptTailRebase: {
    id: randomUUID(),
    title: "Autosave receipt tail rebase fixture",
  },
  cleanMergeReceiptTailRebase: {
    id: randomUUID(),
    title: "Autosave clean-merge receipt tail rebase fixture",
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
  focusedPassiveBroadcast: {
    id: randomUUID(),
    title: "Autosave focused passive broadcast fixture",
  },
  imeCompositionSync: {
    id: randomUUID(),
    title: "Autosave IME composition sync fixture",
  },
  imeAutosaveMerge: {
    id: randomUUID(),
    title: "Autosave IME clean merge fixture",
  },
  imeTitle: {
    id: randomUUID(),
    title: "Autosave IME title fixture",
  },
  imePagehide: {
    id: randomUUID(),
    title: "Autosave IME pagehide fixture",
  },
  imeInFlightMerge: {
    id: randomUUID(),
    title: "Autosave in-flight IME merge fixture",
  },
  passiveDeviceSync: {
    id: randomUUID(),
    title: "Autosave passive device sync fixture",
  },
  focusedPassivePolling: {
    id: randomUUID(),
    title: "Autosave focused passive polling fixture",
  },
  focusPollingFence: {
    id: randomUUID(),
    title: "Autosave focus polling fence fixture",
  },
  focusPollingFailure: {
    id: randomUUID(),
    title: "Autosave focus polling failure fixture",
  },
  backgroundPolling: {
    id: randomUUID(),
    title: "Autosave background polling fixture",
  },
  selectionDuringPolling: {
    id: randomUUID(),
    title: "Autosave selection during polling fixture",
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
  mergeTrailingSummary: {
    id: randomUUID(),
    title: "Autosave merge trailing summary fixture",
  },
  mergeTrailingRefresh: {
    id: randomUUID(),
    title: "Autosave merge trailing refresh fixture",
  },
  identicalSummarySessions: {
    id: randomUUID(),
    title: "Autosave identical summary sessions fixture",
  },
} as const;
export const MERGE_ID = FIXTURES.merge.id;

export async function provisionWikiAutosaveFixtures() {
  await withDatabaseClient(async (client) => {
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

    const projectionTopologyContent = JSON.stringify([
      {
        type: "p",
        children: [
          {
            type: "a",
            pageId: FIXTURES.topologyProjectionChild.id,
            url: `/wiki/${FIXTURES.topologyProjectionChild.id}`,
            children: [{ text: FIXTURES.topologyProjectionChild.title }],
          },
        ],
      },
      { type: "p", children: [{ text: "Projection parent body." }] },
    ]);
    await client.query("update wiki_pages set content = $1 where id = $2", [
      projectionTopologyContent,
      FIXTURES.topologyProjectionParent.id,
    ]);
    await client.query("update wiki_pages set parent_id = $1 where id = $2", [
      FIXTURES.topologyProjectionOtherParent.id,
      FIXTURES.topologyProjectionChild.id,
    ]);

    const emptyProjectionTopologyContent = JSON.stringify([
      {
        type: "p",
        children: [
          {
            type: "a",
            pageId: FIXTURES.topologyEmptyProjectionChild.id,
            url: `/wiki/${FIXTURES.topologyEmptyProjectionChild.id}`,
            children: [{ text: FIXTURES.topologyEmptyProjectionChild.title }],
          },
        ],
      },
      { type: "p", children: [{ text: "Empty projection parent body." }] },
    ]);
    await client.query("update wiki_pages set content = $1 where id = $2", [
      emptyProjectionTopologyContent,
      FIXTURES.topologyEmptyProjectionParent.id,
    ]);
    await client.query("update wiki_pages set parent_id = $1 where id = $2", [
      FIXTURES.topologyEmptyProjectionParent.id,
      FIXTURES.topologyEmptyProjectionChild.id,
    ]);
  });
}

export async function cleanupWikiAutosaveFixtures() {
  await queryDatabase("delete from wiki_pages where id = any($1::uuid[])", [
    Object.values(FIXTURES).map((fixture) => fixture.id),
  ]);
}

export async function appendAfterText(
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

export async function selectText(page: Page, text: string) {
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
  // The DOM selection changes before Plate projects it into the editor state.
  // Let that projection settle before sending the formatting shortcut so the
  // test models a real select-then-command interaction in production builds.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function selectAndFormatText(
  page: Page,
  text: string,
  shortcut: string,
) {
  await selectText(page, text);
  await page.keyboard.press(shortcut);
}

export async function formatText(page: Page, text: string, shortcut: string) {
  await selectAndFormatText(page, text, shortcut);
  await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
    "data-autosave-status",
    "unsaved",
  );
}

export async function formatTextWithDomSelection(
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

export async function readPersistedContent(pageId: string) {
  const result = await queryDatabase<{ content: string }>(
    "select content from wiki_pages where id = $1",
    [pageId],
  );
  return JSON.parse(result.rows[0]!.content) as unknown[];
}

export async function readPersistedTitle(pageId: string) {
  const result = await queryDatabase<{ title: string }>(
    "select title from wiki_pages where id = $1",
    [pageId],
  );
  return result.rows[0]?.title;
}

export async function readPersistedParent(pageId: string) {
  const result = await queryDatabase<{ parentId: string | null }>(
    'select parent_id as "parentId" from wiki_pages where id = $1',
    [pageId],
  );
  return result.rows[0]?.parentId;
}

export async function writeRemoteContent(pageId: string, content: string) {
  await queryDatabase(
    `update wiki_pages
         set content = $1,
             version = version + 1,
             updated_at = now()
       where id = $2`,
    [content, pageId],
  );
}

export async function writeRemoteParent(
  pageId: string,
  parentId: string | null,
) {
  await queryDatabase(
    `update wiki_pages
         set parent_id = $1,
             version = version + 1,
             updated_at = now()
       where id = $2`,
    [parentId, pageId],
  );
}

export async function writeRemoteTitle(pageId: string, title: string) {
  await queryDatabase(
    `update wiki_pages
         set title = $1,
             version = version + 1,
             updated_at = now()
       where id = $2`,
    [title, pageId],
  );
}

export async function readLocalDraftSnapshot(page: Page, pageId: string) {
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
      return {
        ...(JSON.parse(latest.draftSnapshot) as {
          title: string;
          content: string;
          editSummary: string;
        }),
        updatedAt: latest.updatedAt,
      } as {
        title: string;
        content: string;
        editSummary: string;
        updatedAt: number;
      };
    } finally {
      database.close();
    }
  }, pageId);
}

export async function waitForDraftResume(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function holdFirstSaveUntilReleased(
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

export async function holdFirstSaveRequestUntilReleased(
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

export async function holdFirstSaveResponseUntilReleased(
  page: Page,
  editPath: string,
  pollingAction: string,
) {
  let release!: () => void;
  let markReady!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  let held = false;
  let firstSaveAction: string | undefined;
  let subsequentSaveCount = 0;

  await page.route(`**${editPath}`, async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().headers()["next-action"] === pollingAction
    ) {
      await route.continue();
      return;
    }
    if (held) {
      if (route.request().headers()["next-action"] === firstSaveAction) {
        subsequentSaveCount += 1;
      }
      await route.continue();
      return;
    }
    held = true;
    firstSaveAction = route.request().headers()["next-action"];
    const response = await route.fetch();
    markReady();
    await gate;
    await route.fulfill({ response });
  });

  return {
    release,
    ready,
    getSubsequentSaveCount: () => subsequentSaveCount,
  };
}

export async function holdNextPollingRequestUntilReleased(
  page: Page,
  editPath: string,
  pollingAction: string,
  completion: "continue" | "abort" = "continue",
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
      route.request().headers()["next-action"] !== pollingAction ||
      held
    ) {
      await route.continue();
      return;
    }
    held = true;
    markSeen();
    await gate;
    if (completion === "abort") {
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  return { release, seen };
}

export {
  loginAsAdmin,
  captureWikiPollingAction,
  createUntitledWikiPage,
  waitForHydratedWikiEditor,
  wikiPageUrl,
};
