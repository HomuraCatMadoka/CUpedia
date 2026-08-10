import { expect, test } from "@playwright/test";

import {
  cleanupWikiAutosaveFixtures,
  FIXTURES,
  readLocalDraftSnapshot,
  loginAsAdmin,
  captureWikiPollingAction,
  waitForHydratedWikiEditor,
  provisionWikiAutosaveFixtures,
} from "./helpers/wiki-edit-autosave";

test.beforeAll(provisionWikiAutosaveFixtures);
test.afterAll(cleanupWikiAutosaveFixtures);

test.describe("#432 autosave durable storage", () => {
  test("a failed durable submission preparation never reaches the server", async ({
    page,
  }) => {
    const pageId = FIXTURES.submissionStorageFailure.id;
    const editPath = `/wiki/${pageId}`;
    const title = `Durable prepare failure ${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto(editPath);
    await waitForHydratedWikiEditor(page);
    const pollingAction = await captureWikiPollingAction(page, pageId);

    await page.getByLabel("页面标题").fill(title);
    await expect
      .poll(async () => (await readLocalDraftSnapshot(page, pageId))?.title)
      .toBe(title);

    await page.evaluate(() => {
      const prototype = IDBObjectStore.prototype;
      const originalPut = prototype.put;
      let shouldFail = true;
      Object.defineProperty(prototype, "put", {
        configurable: true,
        writable: true,
        value(
          this: IDBObjectStore,
          ...args: Parameters<IDBObjectStore["put"]>
        ) {
          if (shouldFail && this.name === "drafts") {
            shouldFail = false;
            throw new DOMException(
              "Simulated durable submission failure",
              "QuotaExceededError",
            );
          }
          return originalPut.apply(this, args);
        },
      });
    });

    let serverSubmissions = 0;
    await page.route(`**${editPath}`, async (route) => {
      const request = route.request();
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] !== pollingAction
      ) {
        serverSubmissions += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.keyboard.press("Control+s");
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "error",
    );
    expect(serverSubmissions).toBe(0);
  });

  test("a transient local recovery failure blocks editing until retry succeeds", async ({
    page,
  }) => {
    const pageId = FIXTURES.recoveryStorageFailure.id;
    await page.addInitScript(() => {
      const prototype = IDBDatabase.prototype;
      const originalTransaction = prototype.transaction;
      let shouldFail = true;
      Object.defineProperty(prototype, "transaction", {
        configurable: true,
        writable: true,
        value(
          this: IDBDatabase,
          storeNames: string | string[],
          mode?: IDBTransactionMode,
          options?: IDBTransactionOptions,
        ) {
          if (
            shouldFail &&
            (storeNames === "drafts" || storeNames.includes("drafts"))
          ) {
            shouldFail = false;
            throw new DOMException(
              "Simulated recovery read failure",
              "InvalidStateError",
            );
          }
          return originalTransaction.call(this, storeNames, mode, options);
        },
      });
    });

    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);

    await expect(
      page.getByRole("alert", { name: "本地草稿恢复失败" }),
    ).toBeVisible();
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "inert",
      "",
    );
    await expect(page.getByLabel("页面标题")).not.toBeEditable();

    await page.getByRole("button", { name: "重试", exact: true }).click();
    await waitForHydratedWikiEditor(page);
    await expect(
      page.getByRole("alert", { name: "本地草稿恢复失败" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("页面标题")).toBeEditable();
  });

  test("a settled deployed legacy record upgrades without a recovery prompt", async ({
    page,
  }) => {
    const pageId = FIXTURES.settledLegacyRecovery.id;
    await loginAsAdmin(page);
    await page.goto(`/wiki/${pageId}`);
    await waitForHydratedWikiEditor(page);
    const settledTitle = `Settled legacy ${Date.now()}`;
    await page.getByLabel("页面标题").fill(settledTitle);

    const readCurrentDraft = () =>
      page.evaluate(async (targetPageId) => {
        const sessionPrefix = "__cupediaWikiDraftSession:";
        const currentSuffix = `:page:${targetPageId}`;
        const currentSessionKey = Object.keys(sessionStorage).find(
          (key) => key.startsWith(sessionPrefix) && key.endsWith(currentSuffix),
        );
        if (!currentSessionKey) throw new Error("current session is missing");
        const userId = currentSessionKey.slice(
          sessionPrefix.length,
          -currentSuffix.length,
        );
        const sessionId = sessionStorage.getItem(currentSessionKey);
        if (!sessionId) throw new Error("current session id is missing");
        const currentKey = `${userId}:page:${targetPageId}:${sessionId}`;
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("cupedia-wiki-drafts", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const stored = await new Promise<
          | {
              baseVersion: number;
              contentGeneration: number;
              baseSnapshot: string;
              draftSnapshot: string;
            }
          | undefined
        >((resolve, reject) => {
          const transaction = database.transaction("drafts", "readonly");
          const request = transaction.objectStore("drafts").get(currentKey);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return stored
          ? {
              ...stored,
              userId,
              pageId: targetPageId,
              sessionId,
              currentKey,
              currentSessionKey,
              legacyKey: `${userId}:${targetPageId}:${sessionId}`,
              legacySessionKey: `${sessionPrefix}${userId}:${targetPageId}`,
            }
          : null;
      }, pageId);

    await expect.poll(readCurrentDraft).not.toBeNull();
    const identity = await readCurrentDraft();
    if (!identity) throw new Error("local draft was not persisted");

    await page.keyboard.press("Control+s");
    await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
      "data-autosave-status",
      "saved",
      { timeout: 15_000 },
    );

    await page.evaluate(async (keys) => {
      sessionStorage.removeItem(keys.currentSessionKey);
      sessionStorage.setItem(keys.legacySessionKey, keys.sessionId);
      history.replaceState({}, "", location.href);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("cupedia-wiki-drafts", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("drafts", "readwrite");
        const store = transaction.objectStore("drafts");
        store.delete(keys.currentKey);
        store.put({
          key: keys.legacyKey,
          schemaVersion: 1,
          userId: keys.userId,
          pageId: keys.pageId,
          sessionId: keys.sessionId,
          baseVersion: keys.baseVersion,
          contentGeneration: keys.contentGeneration,
          baseSnapshot: keys.baseSnapshot,
          submittedSnapshot: keys.draftSnapshot,
          draftSnapshot: keys.draftSnapshot,
          updatedAt: Date.now(),
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    }, identity);

    await page.reload();
    const editor = await waitForHydratedWikiEditor(page);
    await expect(
      page.getByRole("dialog", { name: "恢复本地草稿" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("页面标题")).toHaveValue(settledTitle);
    await expect(editor).toContainText("Alpha block.");

    const recovered = await page.evaluate(
      async ({ keys }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("cupedia-wiki-drafts", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("drafts", "readonly");
        const store = transaction.objectStore("drafts");
        const read = (key: string) =>
          new Promise<unknown>((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        const [legacyRecord, currentRecord] = await Promise.all([
          read(keys.legacyKey),
          read(keys.currentKey),
        ]);
        database.close();
        return {
          legacyRecord,
          currentRecord,
          legacySessionId: sessionStorage.getItem(keys.legacySessionKey),
          currentSessionId: sessionStorage.getItem(keys.currentSessionKey),
        };
      },
      { keys: identity },
    );
    expect(recovered).toEqual({
      legacyRecord: undefined,
      currentRecord: undefined,
      legacySessionId: null,
      currentSessionId: identity.sessionId,
    });
  });
});
