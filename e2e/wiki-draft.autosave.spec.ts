import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { queryDatabase as query } from "./helpers/database";
import {
  captureWikiPollingAction,
  waitForHydratedWikiEditor,
} from "./helpers/wiki";

async function holdWikiDraftWritesUntilReleased(page: Page) {
  await page.evaluate(async () => {
    const scope = window as typeof window & {
      __releaseWikiDraftWriteBlocker?: boolean;
    };
    scope.__releaseWikiDraftWriteBlocker = false;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("cupedia-wiki-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("drafts", "readwrite");
    const store = transaction.objectStore("drafts");
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => database.close();

    await new Promise<void>((resolve, reject) => {
      let ready = false;
      const keepAlive = () => {
        const request = store.get("__wiki-draft-write-blocker__");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (!ready) {
            ready = true;
            resolve();
          }
          if (!scope.__releaseWikiDraftWriteBlocker) keepAlive();
        };
      };
      keepAlive();
    });
  });

  return () =>
    page.evaluate(() => {
      const scope = window as typeof window & {
        __releaseWikiDraftWriteBlocker?: boolean;
      };
      scope.__releaseWikiDraftWriteBlocker = true;
    });
}

test.describe("#465 private Wiki draft autosave and sessions", () => {
  test.setTimeout(120_000);

  test("freezes editing while a private draft is durably drained for navigation", async ({
    page,
  }) => {
    let pageId: string | null = null;
    let releaseWrites: (() => Promise<unknown>) | undefined;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      await waitForHydratedWikiEditor(page);
      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      const draftUrl = page.url();

      await page.getByLabel("页面标题").fill("私有草稿导航基线");
      await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
      releaseWrites = await holdWikiDraftWritesUntilReleased(page);

      const finalTitle = `私有草稿导航最终版 ${Date.now()}`;
      await page.getByLabel("页面标题").fill(finalTitle);
      const navigation = page
        .getByRole("link", { name: "CUpedia" })
        .first()
        .click();

      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "inert",
        "",
        { timeout: 3_000 },
      );

      await releaseWrites();
      releaseWrites = undefined;
      await navigation;
      await expect(page).toHaveURL(/\/wiki$/);

      await page.goto(draftUrl);
      await waitForHydratedWikiEditor(page);
      await expect(page.getByLabel("页面标题")).toHaveValue(finalTitle);
    } finally {
      await releaseWrites?.();
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
        await query("delete from wiki_pages where id = $1", [pageId]);
      }
    }
  });

  test("drains edits made while a private autosave response is in flight", async ({
    page,
  }) => {
    let pageId: string | null = null;
    let releaseFirstResponse: (() => void) | undefined;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      await waitForHydratedWikiEditor(page);
      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      await expect
        .poll(async () => {
          const draft = await query<{ count: string }>(
            "select count(*)::text as count from wiki_drafts where id = $1",
            [pageId!],
          );
          return draft.rows[0]?.count;
        })
        .toBe("1");
      const pollingAction = await captureWikiPollingAction(page, pageId);

      let release!: () => void;
      const firstResponseGate = new Promise<void>((resolve) => {
        release = resolve;
        releaseFirstResponse = resolve;
      });
      let markFirstResponseHeld!: () => void;
      const firstResponseHeld = new Promise<void>((resolve) => {
        markFirstResponseHeld = resolve;
      });
      let held = false;
      await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
        const request = route.request();
        const action = request.headers()["next-action"];
        if (
          request.method() === "POST" &&
          action &&
          action !== pollingAction &&
          !held
        ) {
          held = true;
          const response = await route.fetch();
          markFirstResponseHeld();
          await firstResponseGate;
          await route.fulfill({ response });
          return;
        }
        await route.continue();
      });

      await page.getByLabel("页面标题").fill("请求中的第一版");
      await firstResponseHeld;
      await page.getByLabel("页面标题").fill("请求中的最终版");
      await page.locator('[data-slate-editor="true"]').fill("尾随正文");
      release();

      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(
        page.getByRole("status", { name: "自动保存已暂停" }),
      ).toHaveCount(0);
      await expect
        .poll(async () => {
          const draft = await query<{ title: string; content: string }>(
            "select title, content from wiki_drafts where id = $1",
            [pageId!],
          );
          return draft.rows[0];
        })
        .toEqual(
          expect.objectContaining({
            title: "请求中的最终版",
            content: expect.stringContaining("尾随正文"),
          }),
        );
    } finally {
      releaseFirstResponse?.();
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("converges when input returns to the in-flight private snapshot", async ({
    page,
  }) => {
    let pageId: string | null = null;
    let releaseResponse: (() => void) | undefined;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      await waitForHydratedWikiEditor(page);
      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      await expect
        .poll(async () => {
          const draft = await query<{ count: string }>(
            "select count(*)::text as count from wiki_drafts where id = $1",
            [pageId!],
          );
          return draft.rows[0]?.count;
        })
        .toBe("1");
      const pollingAction = await captureWikiPollingAction(page, pageId);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
        releaseResponse = resolve;
      });
      let markHeld!: () => void;
      const held = new Promise<void>((resolve) => {
        markHeld = resolve;
      });
      let postCount = 0;
      await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
        const request = route.request();
        const action = request.headers()["next-action"];
        if (
          request.method() !== "POST" ||
          !action ||
          action === pollingAction
        ) {
          await route.continue();
          return;
        }
        postCount += 1;
        if (postCount === 1) {
          const response = await route.fetch();
          markHeld();
          await gate;
          await route.fulfill({ response });
          return;
        }
        await route.continue();
      });

      await page.getByLabel("页面标题").fill("请求快照");
      await held;
      await page.getByLabel("页面标题").fill("临时尾随输入");
      await page.getByLabel("页面标题").fill("请求快照");
      release();

      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      const persisted = await query<{ title: string }>(
        "select title from wiki_drafts where id = $1",
        [pageId],
      );
      expect(persisted.rows).toEqual([{ title: "请求快照" }]);
      await expect(
        page.getByRole("status", { name: "自动保存已暂停" }),
      ).toHaveCount(0);
    } finally {
      releaseResponse?.();
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("returns before an in-flight private save finishes without self-conflicting", async ({
    page,
  }) => {
    let pageId: string | null = null;
    let releaseResponse: (() => void) | undefined;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      const draftUrl = page.url();
      pageId = new URL(draftUrl).pathname.split("/").at(-1)!;
      await expect
        .poll(async () => {
          const draft = await query<{ count: string }>(
            "select count(*)::text as count from wiki_drafts where id = $1",
            [pageId!],
          );
          return draft.rows[0]?.count;
        })
        .toBe("1");
      const pollingAction = await captureWikiPollingAction(page, pageId);

      let release!: () => void;
      const responseGate = new Promise<void>((resolve) => {
        release = resolve;
        releaseResponse = resolve;
      });
      let markResponseHeld!: () => void;
      const responseHeld = new Promise<void>((resolve) => {
        markResponseHeld = resolve;
      });
      let held = false;
      await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
        const request = route.request();
        const action = request.headers()["next-action"];
        if (
          request.method() === "POST" &&
          action &&
          action !== pollingAction &&
          !held
        ) {
          held = true;
          const response = await route.fetch();
          markResponseHeld();
          await responseGate;
          await route.fulfill({ response });
          return;
        }
        await route.continue();
      });

      await page.getByLabel("页面标题").fill("切页前第一版");
      await responseHeld;
      await page.getByLabel("页面标题").fill("切页后的后台最终版");
      await page.getByRole("link", { name: "CUpedia" }).first().click();

      await expect(page).toHaveURL(/\/wiki$/, { timeout: 3_000 });
      await page
        .getByRole("tree", { name: "Wiki 页面层级" })
        .locator(`a[href="/wiki/${pageId}"]`)
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/wiki/${pageId}(?:\\?draft=1)?$`),
      );
      await expect(page.getByLabel("页面标题")).toHaveValue(
        "切页后的后台最终版",
      );
      await page.getByLabel("页面标题").fill("切回后继续输入");

      release();
      await expect
        .poll(async () => {
          const persisted = await query<{ title: string }>(
            "select title from wiki_drafts where id = $1",
            [pageId!],
          );
          return persisted.rows[0]?.title;
        })
        .toBe("切回后继续输入");
      await expect(
        page.getByRole("status", { name: "自动保存已暂停" }),
      ).toHaveCount(0);
    } finally {
      releaseResponse?.();
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("failed background autosave still allows Back and restores the local draft", async ({
    page,
  }) => {
    let pageId: string | null = null;
    await loginAsAdmin(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "navigation", {
        value: undefined,
        configurable: true,
      });
    });
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      await waitForHydratedWikiEditor(page);
      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      await expect
        .poll(async () => {
          const draft = await query<{ count: string }>(
            "select count(*)::text as count from wiki_drafts where id = $1",
            [pageId!],
          );
          return draft.rows[0]?.count;
        })
        .toBe("1");

      await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
        if (
          route.request().method() === "POST" &&
          route.request().headers()["next-action"]
        ) {
          await route.abort("failed");
          return;
        }
        await route.continue();
      });
      await page.getByLabel("页面标题").fill("Back 本地恢复");
      await page.locator('[data-slate-editor="true"]').fill("本地正文");
      const draftUrl = page.url();
      await page.goBack();
      await expect(page).toHaveURL(/\/wiki$/);

      const localDrafts = await page.evaluate(
        () =>
          new Promise<unknown[]>((resolve, reject) => {
            const open = indexedDB.open("cupedia-wiki-drafts", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const database = open.result;
              const request = database
                .transaction("drafts", "readonly")
                .objectStore("drafts")
                .getAll();
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                resolve(request.result);
                database.close();
              };
            };
          }),
      );
      expect(JSON.stringify(localDrafts)).toContain("Back 本地恢复");
      expect(JSON.stringify(localDrafts)).toContain("本地正文");
      const localRecord = (
        localDrafts as Array<{
          pageId: string;
          sessionId: string;
          baseVersion: number;
        }>
      ).find((record) => record.pageId === pageId);
      expect(localRecord).toBeDefined();
      const tabSessions = await page.evaluate(() =>
        Object.values(sessionStorage),
      );
      expect(tabSessions).toContain(localRecord?.sessionId);

      await page.goto(draftUrl);
      await expect(page.getByLabel("页面标题")).toHaveValue("Back 本地恢复");
      await expect(page.locator('[data-slate-editor="true"]')).toContainText(
        "本地正文",
      );
    } finally {
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("runtime storage failure prevents Back from discarding a private draft", async ({
    page,
  }) => {
    let pageId: string | null = null;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      await waitForHydratedWikiEditor(page);
      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      const draftUrl = page.url();
      const durableTitle = `Durable private draft ${Date.now()}`;
      const memoryTitle = `${durableTitle} latest`;

      await page.getByLabel("页面标题").fill(durableTitle);
      await page.keyboard.press("Control+s");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
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
                "Simulated private draft storage failure",
                "QuotaExceededError",
              );
            }
            return originalPut.apply(this, args);
          },
        });
      });

      await page.getByLabel("页面标题").fill(memoryTitle);
      await expect(
        page.getByRole("alert", { name: "本地草稿恢复失败" }),
      ).toBeVisible({ timeout: 5_000 });
      await page.evaluate(() => history.back());
      await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
        "本地草稿保存失败",
      );
      await expect(page).toHaveURL(draftUrl);

      await page.getByRole("button", { name: "重试", exact: true }).click();
      await waitForHydratedWikiEditor(page);
      await expect(page.getByLabel("页面标题")).toHaveValue(memoryTitle);
      await expect
        .poll(async () => {
          const draft = await query<{ title: string }>(
            "select title from wiki_drafts where id = $1",
            [pageId!],
          );
          return draft.rows[0]?.title;
        })
        .toBe(memoryTitle);
    } finally {
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("a clean private-draft tab adopts a completed save before editing", async ({
    context,
    page: pageA,
  }) => {
    let pageId: string | null = null;
    let pageB: Page | null = null;
    await loginAsAdmin(pageA);
    try {
      await pageA.goto("/wiki");
      await pageA.getByRole("button", { name: "新建页面" }).first().click();
      await expect(pageA).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      pageId = new URL(pageA.url()).pathname.split("/").at(-1)!;
      await waitForHydratedWikiEditor(pageA);

      await pageA.getByLabel("页面标题").fill("私有草稿基线");
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      pageB = await context.newPage();
      await pageB.goto(`/wiki/${pageId}?draft=1`);
      await waitForHydratedWikiEditor(pageB);

      await pageA.getByLabel("页面标题").fill("私有草稿已由 A 保存");
      await pageA.keyboard.press("Control+s");
      await expect(pageA.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      await expect(pageB.getByLabel("页面标题")).toHaveValue(
        "私有草稿已由 A 保存",
        { timeout: 10_000 },
      );
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "idle",
      );

      await pageB.getByLabel("页面标题").fill("私有草稿由 B 继续");
      await pageB.keyboard.press("Control+s");
      await expect(pageB.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );
      await expect(pageB.getByRole("dialog")).toHaveCount(0);
    } finally {
      await pageB?.close();
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("keeps duplicated tabs in separate local draft sessions", async ({
    page,
  }) => {
    let pageId: string | null = null;
    let duplicate: Page | null = null;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\/wiki\/[0-9a-f-]{36}\?draft=1$/);
      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      await expect
        .poll(async () => {
          const draft = await query<{ count: string }>(
            "select count(*)::text as count from wiki_drafts where id = $1",
            [pageId!],
          );
          return draft.rows[0]?.count;
        })
        .toBe("1");

      const popup = page.waitForEvent("popup");
      await page.evaluate(() => window.open(location.href, "_blank"));
      duplicate = await popup;
      await expect(duplicate.getByTestId("wiki-editor-shell")).toBeVisible();

      const getSessionId = (target: Page) =>
        target.evaluate(
          (currentPageId) =>
            Object.entries(sessionStorage).find(([key]) =>
              key.endsWith(`:${currentPageId}`),
            )?.[1] ?? null,
          pageId!,
        );
      await expect.poll(() => getSessionId(page)).not.toBeNull();
      await expect.poll(() => getSessionId(duplicate!)).not.toBeNull();
      const originalSessionId = await getSessionId(page);
      const duplicateSessionId = await getSessionId(duplicate);
      expect(originalSessionId).toBeTruthy();
      expect(duplicateSessionId).toBeTruthy();
      expect(duplicateSessionId).not.toBe(originalSessionId);

      const abortAutosave = async (target: Page) => {
        await target.route(`**/wiki/${pageId}?draft=1`, async (route) => {
          if (
            route.request().method() === "POST" &&
            route.request().headers()["next-action"]
          ) {
            await route.abort("failed");
            return;
          }
          await route.continue();
        });
      };
      await abortAutosave(page);
      await abortAutosave(duplicate);
      await page.getByLabel("页面标题").fill("原标签页草稿");
      await duplicate.getByLabel("页面标题").fill("复制标签页草稿");

      await expect
        .poll(async () =>
          page.evaluate(
            (currentPageId) =>
              new Promise<string[]>((resolve, reject) => {
                const open = indexedDB.open("cupedia-wiki-drafts", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                  const database = open.result;
                  const request = database
                    .transaction("drafts", "readonly")
                    .objectStore("drafts")
                    .getAll();
                  request.onerror = () => reject(request.error);
                  request.onsuccess = () => {
                    resolve(
                      request.result
                        .filter((record) => record.pageId === currentPageId)
                        .map((record) => record.draftSnapshot),
                    );
                    database.close();
                  };
                };
              }),
            pageId!,
          ),
        )
        .toEqual(
          expect.arrayContaining([
            expect.stringContaining("原标签页草稿"),
            expect.stringContaining("复制标签页草稿"),
          ]),
        );
    } finally {
      await duplicate?.close();
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("keeps a real concurrent private-draft edit as a conflict", async ({
    page,
  }) => {
    let pageId: string | null = null;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();
      await expect(page).toHaveURL(/\?draft=1$/);
      await waitForHydratedWikiEditor(page);
      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      await page.getByLabel("页面标题").fill("跨标签基线");
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "data-autosave-status",
        "saved",
        { timeout: 15_000 },
      );

      await query(
        `update wiki_drafts
            set title = $2, version = version + 1, updated_at = now()
          where id = $1`,
        [pageId, "另一个标签页版本"],
      );

      await page.getByLabel("页面标题").fill("当前标签页版本");
      await expect(
        page.getByRole("status", { name: "自动保存已暂停" }),
      ).toContainText("服务器版本已更新", { timeout: 15_000 });
      await expect(page.getByLabel("页面标题")).toHaveValue("当前标签页版本");
      const persisted = await query<{ title: string }>(
        "select title from wiki_drafts where id = $1",
        [pageId],
      );
      expect(persisted.rows).toEqual([{ title: "另一个标签页版本" }]);
    } finally {
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });
});
