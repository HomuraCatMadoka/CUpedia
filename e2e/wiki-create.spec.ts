import { expect, test } from "@playwright/test";
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

  test("leaves a private draft without waiting for server autosave", async ({
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
        if (route.request().method() === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
        await route.continue();
      });
      await page.getByLabel("页面标题").fill("本地优先导航");
      await page.getByRole("link", { name: "CUpedia" }).first().click();

      await expect(page).toHaveURL(/\/wiki$/, { timeout: 3_000 });
    } finally {
      if (pageId) {
        await query("delete from wiki_drafts where id = $1", [pageId]);
      }
    }
  });

  test("browser Back keeps a local private draft without Navigation API", async ({
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
      await expect(page).toHaveURL(/\?draft=1$/);
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
        if (route.request().method() === "POST") {
          await route.abort("failed");
          return;
        }
        await route.continue();
      });
      await page.getByLabel("页面标题").fill("Back 本地恢复");
      await page.locator('[data-slate-editor="true"]').fill("本地正文");
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

      let rejectedPublish = false;
      await page.route(`**/wiki/${pageId}?draft=1`, async (route) => {
        if (!rejectedPublish && route.request().method() === "POST") {
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
