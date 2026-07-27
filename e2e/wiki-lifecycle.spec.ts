import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { canonicalWikiPageUrl, wikiPageUrl } from "./helpers/wiki";

const slug = `lifecycle-${randomUUID().slice(0, 8)}`;
const title = `Lifecycle ${slug}`;
const first = `first-${randomUUID()}`;
const second = `second-${randomUUID()}`;

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

async function revisionCount() {
  const result = await query<{ count: string }>(
    `select count(*)::text as count
     from wiki_revisions r
     join wiki_pages p on p.id = r.page_id
     where p.slug = $1`,
    [slug],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function isDeleted() {
  const result = await query<{ deleted: boolean }>(
    "select deleted_at is not null as deleted from wiki_pages where slug = $1",
    [slug],
  );
  return result.rows[0]?.deleted ?? false;
}

test.afterAll(async () => {
  await query("delete from wiki_pages where slug = $1", [slug]);
});

test("page lifecycle: create, edit, rollback, delete, and restore", async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);

  await page.goto("/wiki/new");
  await page.getByLabel("标题").fill(title);
  await page.getByRole("button", { name: "页面设置" }).click();
  const createSettings = page.getByRole("dialog", { name: "页面设置" });
  await createSettings.getByLabel("URL 路径").fill(slug);
  await createSettings
    .getByLabel("编辑摘要（可选）")
    .fill("create lifecycle page");
  await page.keyboard.press("Escape");
  await expect(createSettings).toHaveCount(0);
  await page.locator('[role="textbox"]').first().fill(first);
  await page.getByRole("button", { name: "完成" }).click();
  await page.waitForURL(canonicalWikiPageUrl);
  const pageId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(page.getByText(first)).toBeVisible();
  expect(await revisionCount()).toBe(1);

  await page.getByText("编辑", { exact: true }).click();
  await page.getByRole("button", { name: "页面设置" }).click();
  const editSettings = page.getByRole("dialog", { name: "页面设置" });
  await editSettings.getByLabel("编辑摘要（可选）").fill("edit lifecycle page");
  await page.keyboard.press("Escape");
  await expect(editSettings).toHaveCount(0);
  const editor = page.locator('[role="textbox"]').first();
  await editor.fill(`${first} ${second}`);
  await expect(page.getByText("未保存")).toBeVisible();
  await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
  expect(await revisionCount()).toBe(2);
  await expect(async () => {
    await page.goto(`/wiki/${slug}`);
    await expect(page.getByText(second, { exact: false })).toBeVisible();
  }).toPass({ timeout: 20_000 });

  await page.getByText("历史", { exact: true }).click();
  await expect(page.getByText("edit lifecycle page")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看" })).toHaveCount(2);
  await page.getByRole("link", { name: "对比" }).click();
  await expect(page.getByRole("heading", { name: "版本对比" })).toBeVisible();
  await expect(page.getByText(first, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(second, { exact: false })).toBeVisible();

  await page.getByRole("link", { name: /返回历史/ }).click();
  await page.getByRole("link", { name: "查看" }).last().click();
  await expect(page.getByText(first)).toBeVisible();
  await page.getByRole("button", { name: "回滚到此版本" }).click();
  await page.waitForURL(wikiPageUrl(pageId));
  expect(await revisionCount()).toBe(3);
  await expect(async () => {
    await page.goto(`/wiki/${slug}`);
    await expect(page.getByText(first)).toBeVisible();
    await expect(page.getByText(second, { exact: false })).toHaveCount(0);
  }).toPass({ timeout: 20_000 });

  await page.getByRole("button", { name: "删除" }).click();
  await page.waitForURL("**/wiki");
  expect(await isDeleted()).toBe(true);
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await expect(async () => {
    await publicPage.goto(`/wiki/${slug}`);
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
  expect(await isDeleted()).toBe(false);

  const restoredContext = await browser.newContext();
  const restoredPage = await restoredContext.newPage();
  await expect(async () => {
    await restoredPage.goto(`/wiki/${slug}`);
    await expect(restoredPage.getByText(first)).toBeVisible();
  }).toPass({ timeout: 20_000 });
  await restoredContext.close();

  await page.goto(`/wiki/history/${pageId}`);
  await expect(page.getByRole("link", { name: "查看" })).toHaveCount(3);
  expect(await revisionCount()).toBe(3);
});
