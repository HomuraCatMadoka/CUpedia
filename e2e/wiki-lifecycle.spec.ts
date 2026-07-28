import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createUntitledWikiPage, wikiPageUrl } from "./helpers/wiki";

const fixtureToken = `lifecycle-${randomUUID().slice(0, 8)}`;
const title = `Lifecycle ${fixtureToken}`;
const first = `first-${randomUUID()}`;
const second = `second-${randomUUID()}`;
let createdPageId = "";

test.setTimeout(90_000);

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

async function revisionCount(pageId: string) {
  const result = await query<{ count: string }>(
    `select count(*)::text as count
     from wiki_revisions r
     where r.page_id = $1`,
    [pageId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function isDeleted(pageId: string) {
  const result = await query<{ deleted: boolean }>(
    "select deleted_at is not null as deleted from wiki_pages where id = $1",
    [pageId],
  );
  return result.rows[0]?.deleted ?? false;
}

async function contentGeneration(pageId: string) {
  const result = await query<{ content_generation: number }>(
    "select content_generation from wiki_pages where id = $1",
    [pageId],
  );
  return result.rows[0]?.content_generation ?? 0;
}

test.afterAll(async () => {
  if (createdPageId) {
    await query("delete from wiki_pages where id = $1", [createdPageId]);
  }
});

test("#451 admin UI page lifecycle: create, read, update, delete, and restore", async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);

  await createUntitledWikiPage(page);
  const pageId = new URL(page.url()).pathname.split("/").at(-1)!;
  createdPageId = pageId;
  await expect(page.getByText("Invalid slug", { exact: true })).toHaveCount(0);
  await page.getByLabel("标题").fill(title);
  await page.getByRole("button", { name: "页面设置" }).click();
  const createSettings = page.getByRole("dialog", { name: "页面设置" });
  await createSettings
    .getByLabel("编辑摘要（可选）")
    .fill("create lifecycle page");
  await page.keyboard.press("Escape");
  await expect(createSettings).toHaveCount(0);
  await page.locator('[role="textbox"]').first().fill(first);
  await page.keyboard.press("Control+s");
  await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(first)).toBeVisible();
  await expect(page.getByText("Invalid slug", { exact: true })).toHaveCount(0);
  expect(await revisionCount(pageId)).toBe(2);

  const initialPublicContext = await browser.newContext();
  const initialPublicPage = await initialPublicContext.newPage();
  await initialPublicPage.goto(`/wiki/${pageId}`);
  await expect(
    initialPublicPage.getByRole("heading", { name: title }),
  ).toBeVisible();
  await expect(initialPublicPage.getByText(first)).toBeVisible();
  await expect(initialPublicPage.getByTestId("wiki-editor-shell")).toHaveCount(
    0,
  );
  await initialPublicContext.close();

  await query(
    "update wiki_revisions set created_at = now() - interval '10 minutes' where page_id = $1",
    [pageId],
  );
  const firstRevision = await query<{ id: string }>(
    "select id from wiki_revisions where page_id = $1 and content like $2 order by created_at desc limit 1",
    [pageId, `%${first}%`],
  );
  const firstRevisionId = firstRevision.rows[0]!.id;

  await page.getByRole("button", { name: "页面设置" }).click();
  const editSettings = page.getByRole("dialog", { name: "页面设置" });
  await editSettings.getByLabel("编辑摘要（可选）").fill("edit lifecycle page");
  await page.keyboard.press("Escape");
  await expect(editSettings).toHaveCount(0);
  const editor = page.locator('[role="textbox"]').first();
  await editor.fill(`${first} ${second}`);
  await expect(page.getByText("未保存")).toBeVisible();
  await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
  expect(await revisionCount(pageId)).toBe(3);
  await expect(editor).toContainText(second);

  await page.getByRole("button", { name: "页面设置" }).click();
  await page.getByRole("link", { name: "历史记录" }).click();
  await expect(page.getByText("edit lifecycle page")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看" })).toHaveCount(3);
  await page.getByRole("link", { name: "对比" }).first().click();
  await expect(page.getByRole("heading", { name: "版本对比" })).toBeVisible();
  await expect(page.getByText(first, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(second, { exact: false })).toBeVisible();

  await page.getByRole("link", { name: /返回历史/ }).click();
  await page.goto(`/wiki/history/${pageId}?view=${firstRevisionId}`);
  await expect(page.getByText(first)).toBeVisible();
  const generationBeforeRollback = await contentGeneration(pageId);
  await page.getByRole("button", { name: "回滚到此版本" }).click();
  await page.waitForURL(wikiPageUrl(pageId));
  expect(await contentGeneration(pageId)).toBe(generationBeforeRollback + 1);
  expect(await revisionCount(pageId)).toBe(4);
  await expect(page.locator('[role="textbox"]').first()).toContainText(first);
  await expect(page.locator('[role="textbox"]').first()).not.toContainText(
    second,
  );

  await page.getByRole("button", { name: "页面设置" }).click();
  await page.getByRole("button", { name: "删除页面" }).click();
  await page.waitForURL("**/wiki");
  await expect(
    page
      .getByRole("tree", { name: "Wiki 页面层级" })
      .getByRole("treeitem", { name: title }),
  ).toHaveCount(0);
  expect(await isDeleted(pageId)).toBe(true);
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await expect(async () => {
    await publicPage.goto(`/wiki/${pageId}`);
    await expect(
      publicPage.getByRole("heading", { name: "404" }),
    ).toBeVisible();
  }).toPass({ timeout: 20_000 });
  await expect(publicPage.getByRole("heading", { name: title })).toHaveCount(0);
  await publicContext.close();

  await page.goto("/admin/deleted");
  const deleted = page.locator("div.rounded.border").filter({ hasText: title });
  await expect(deleted).toBeVisible();
  await deleted.getByRole("button", { name: "恢复" }).click();
  await expect(deleted).toHaveCount(0);
  expect(await isDeleted(pageId)).toBe(false);

  const restoredContext = await browser.newContext();
  const restoredPage = await restoredContext.newPage();
  await expect(async () => {
    await restoredPage.goto(`/wiki/${pageId}`);
    await expect(restoredPage.getByText(first)).toBeVisible();
  }).toPass({ timeout: 20_000 });
  await restoredContext.close();

  await page.goto(`/wiki/history/${pageId}`);
  await expect(page.getByRole("link", { name: "查看" })).toHaveCount(4);
  expect(await revisionCount(pageId)).toBe(4);
});
