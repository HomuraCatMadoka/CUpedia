import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { loginAsAdmin, loginWithPassword } from "./helpers/auth";
import { waitForHydratedWikiEditor } from "./helpers/wiki";

async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query<T>(text, values);
  } finally {
    await client.end();
  }
}

async function captureWikiPollingAction(page: Page, pageId: string) {
  const pollingRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      Boolean(request.headers()["next-action"]) &&
      new URL(request.url()).pathname === `/wiki/${pageId}`,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const pollingRequest = await pollingRequestPromise;
  const pollingAction = pollingRequest.headers()["next-action"];
  await pollingRequest.response();
  if (!pollingAction) throw new Error("Wiki polling action was not captured");
  return pollingAction;
}

test.describe("#465 server-backed private Wiki drafts", () => {
  test.setTimeout(120_000);

  test("creates a private page immediately and publishes from Share", async ({
    page,
    browser,
  }) => {
    let pageId: string | null = null;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();

      await expect(page).toHaveURL(
        /\/wiki\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\?draft=1$/i,
        { timeout: 30_000 },
      );
      await waitForHydratedWikiEditor(page);
      await expect(
        page.getByRole("button", { name: "完成", exact: true }),
      ).toBeHidden();
      await expect(
        page.getByRole("button", { name: "共享", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "发布到 Wiki", exact: true }),
      ).toHaveCount(0);

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
      const publicBeforeEditing = await query<{ count: string }>(
        "select count(*)::text as count from wiki_pages where id = $1",
        [pageId!],
      );
      expect(publicBeforeEditing.rows).toEqual([{ count: "0" }]);

      await page.locator('[data-slate-editor="true"]').fill("私有草稿正文");
      await page.getByLabel("页面标题").fill("服务器私有草稿");
      await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
      await expect(
        page
          .getByRole("tree", { name: "Wiki 页面层级" })
          .locator(`a[href="/wiki/${pageId}"]`)
          .filter({ hasText: "服务器私有草稿" }),
      ).toHaveCount(1);
      const persistedDraft = await query<{ title: string }>(
        "select title from wiki_drafts where id = $1",
        [pageId!],
      );
      expect(persistedDraft.rows).toEqual([{ title: "服务器私有草稿" }]);
      const publicBeforePublish = await query<{
        pages: string;
        revisions: string;
      }>(
        `select
           (select count(*) from wiki_pages where id = $1)::text as pages,
           (select count(*) from wiki_revisions where page_id = $1)::text as revisions`,
        [pageId!],
      );
      expect(publicBeforePublish.rows).toEqual([
        { pages: "0", revisions: "0" },
      ]);

      const anonymousBeforePublish = await browser.newPage();
      await anonymousBeforePublish.goto(`/wiki/${pageId}`);
      await expect(
        anonymousBeforePublish.getByRole("heading", { name: "404" }),
      ).toBeVisible();
      await anonymousBeforePublish.close();

      const otherEditor = await browser.newPage();
      await loginWithPassword(
        otherEditor,
        "contributor@test.com",
        "password123",
      );
      await otherEditor.goto(`/wiki/${pageId}`);
      await expect(
        otherEditor.getByRole("heading", { name: "404" }),
      ).toBeVisible();
      await otherEditor.close();

      const reopened = await browser.newPage();
      await loginAsAdmin(reopened);
      await reopened.goto(`/wiki/${pageId}`);
      await expect(reopened.getByLabel("页面标题")).toHaveValue(
        "服务器私有草稿",
      );
      await expect(reopened.getByText("私有草稿正文")).toBeVisible();
      await expect(
        reopened.getByRole("button", { name: "共享", exact: true }),
      ).toBeVisible();
      await expect(
        reopened
          .getByRole("tree", { name: "Wiki 页面层级" })
          .locator(`a[href="/wiki/${pageId}"]`)
          .filter({ hasText: "服务器私有草稿" }),
      ).toHaveCount(1);
      await reopened.close();

      await page.setViewportSize({ width: 393, height: 852 });
      await expect(
        page.getByRole("button", { name: "共享", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "完成", exact: true }),
      ).toHaveCount(0);

      await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
        if (route.request().method() === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        await route.continue();
      });
      await page.getByRole("button", { name: "共享", exact: true }).click();
      await expect(page.getByText("仅自己可见", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "发布到 Wiki" }).click();
      await expect(
        page.getByRole("button", { name: "发布中…", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("wiki-editor-shell")).toHaveAttribute(
        "inert",
        "",
      );
      await expect(page.getByLabel("页面标题")).not.toBeEditable();
      await expect(page.getByRole("alert", { name: "保存错误" })).toHaveCount(
        0,
      );
      await expect(page).toHaveURL(`/wiki/${pageId}`, { timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: "发布到 Wiki", exact: true }),
      ).toHaveCount(0);

      const published = await query<{
        title: string;
        drafts: string;
        revisions: string;
      }>(
        `select p.title,
                (select count(*) from wiki_drafts where id = p.id)::text as drafts,
                count(r.id)::text as revisions
           from wiki_pages p
           left join wiki_revisions r on r.page_id = p.id
          where p.id = $1
          group by p.id`,
        [pageId!],
      );
      expect(published.rows).toEqual([
        { title: "服务器私有草稿", drafts: "0", revisions: "1" },
      ]);

      const anonymous = await browser.newPage();
      await anonymous.goto(`/wiki/${pageId}`);
      await expect(
        anonymous.getByRole("heading", { name: "服务器私有草稿" }),
      ).toBeVisible();
      await expect(anonymous.getByTestId("wiki-editor-shell")).toHaveCount(0);
      await anonymous.close();
    } finally {
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
        await query("delete from wiki_pages where id = $1", [pageId]);
      }
    }
  });

  test("GET /wiki/new never creates a page", async ({ page }) => {
    await loginAsAdmin(page);
    const before = await query<{ count: string }>(
      "select count(*)::text as count from wiki_pages",
    );

    await page.goto("/wiki/new");
    await expect(page).toHaveURL(/\/wiki\/new$/);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    const after = await query<{ count: string }>(
      "select count(*)::text as count from wiki_pages",
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  test("keeps the local page when private initialization fails", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const pageId = crypto.randomUUID();
    const missingParentId = crypto.randomUUID();
    await page.goto(`/wiki/${pageId}?draft=1&parent=${missingParentId}`);

    await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
      "私有草稿尚未同步",
    );
    await expect(
      page
        .getByRole("tree", { name: "Wiki 页面层级" })
        .locator(`a[href="/wiki/${pageId}"]`),
    ).toHaveCount(1);
  });

  test("retries private initialization after a transport failure", async ({
    page,
  }) => {
    const pageId = crypto.randomUUID();
    let rejectedInitialization = false;
    await loginAsAdmin(page);
    await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
      if (!rejectedInitialization && route.request().method() === "POST") {
        rejectedInitialization = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    try {
      await page.goto(`/wiki/${pageId}?draft=1`, { waitUntil: "commit" });
      await expect(page.getByTestId("wiki-editor-shell")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
        "私有草稿尚未同步",
      );
      await page.getByLabel("页面标题").fill("重试后保存");

      await expect
        .poll(async () => {
          const draft = await query<{ title: string }>(
            "select title from wiki_drafts where id = $1",
            [pageId],
          );
          return draft.rows[0]?.title;
        })
        .toBe("重试后保存");
    } finally {
      await query("delete from wiki_drafts where id = $1", [pageId]);
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

  test("unfreezes the draft and retries after publish transport failure", async ({
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
      await page.getByLabel("页面标题").fill("发布重试");
      await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
      const pollingAction = await captureWikiPollingAction(page, pageId);

      let rejectedPublish = false;
      await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
        const request = route.request();
        if (
          !rejectedPublish &&
          request.method() === "POST" &&
          request.headers()["next-action"] !== pollingAction
        ) {
          rejectedPublish = true;
          await route.abort("failed");
          return;
        }
        await route.continue();
      });
      await page.getByRole("button", { name: "共享", exact: true }).click();
      await page.getByRole("button", { name: "发布到 Wiki" }).click();

      await expect(page.getByRole("alert", { name: "保存错误" })).toContainText(
        "发布失败",
      );
      await expect(page.getByTestId("wiki-editor-shell")).not.toHaveAttribute(
        "inert",
      );
      await expect(page.getByLabel("页面标题")).toBeEditable();
      await page.unroute(`**/wiki/${pageId}?draft=1`);
      await page.getByRole("button", { name: "发布到 Wiki" }).click();
      await expect(page).toHaveURL(`/wiki/${pageId}`, { timeout: 30_000 });
    } finally {
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
        await query("delete from wiki_pages where id = $1", [pageId]);
      }
    }
  });

  test("can create another page after the first navigation commits", async ({
    page,
  }) => {
    const pageIds: string[] = [];
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      const createButton = page
        .getByRole("button", { name: "新建页面" })
        .first();

      await createButton.click();
      await expect(page).toHaveURL(/\?draft=1$/);
      pageIds.push(new URL(page.url()).pathname.split("/").at(-1)!);
      await waitForHydratedWikiEditor(page);

      await createButton.click();
      await expect
        .poll(() => new URL(page.url()).pathname.split("/").at(-1))
        .not.toBe(pageIds[0]);
      pageIds.push(new URL(page.url()).pathname.split("/").at(-1)!);
      await expect
        .poll(async () => {
          const drafts = await query<{ count: string }>(
            "select count(*)::text as count from wiki_drafts where id = any($1::uuid[])",
            [pageIds],
          );
          return drafts.rows[0]?.count;
        })
        .toBe("2");
    } finally {
      for (const pageId of pageIds) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });
});
