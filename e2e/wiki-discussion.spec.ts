import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, loginWithPassword } from "./helpers/auth";

const suffix = randomUUID().slice(0, 8);
const slug = `discussion-${suffix}`;
const title = `Discussion ${suffix}`;
const selectedText = `annotate-${suffix}`;
const rootComment = `root-${suffix}`;
const reply = `reply-${suffix}`;

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

async function selectText(page: Page, text: string) {
  const editor = page.locator('[role="textbox"]').first();
  await editor.evaluate((element, needle) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.includes(needle)) {
      node = walker.nextNode();
    }
    if (!node?.textContent) throw new Error(`Text not found: ${needle}`);

    const start = node.textContent.indexOf(needle);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + needle.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  }, text);
}

async function openDiscussion(page: Page) {
  await page.getByRole("button", { name: new RegExp(rootComment) }).click();
  await expect(page.getByText(rootComment, { exact: true })).toBeVisible();
}

test.afterAll(async () => {
  await query(
    "update site_settings set value = 'admin' where key = 'wiki_edit_role'",
  );
  await query("delete from wiki_pages where slug = $1", [slug]);
});

test("#245 annotation discussion lifecycle and permissions", async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);
  await page.goto("/wiki/new");
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("URL 路径").fill(slug);
  await page.locator('[role="textbox"]').first().fill(selectedText);
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(`**/wiki/${slug}`);

  await query(
    "update site_settings set value = 'user' where key = 'wiki_edit_role'",
  );

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await loginWithPassword(owner, "user@test.com", "password123");
  await owner.goto(`/wiki/edit/${slug}`);
  await selectText(owner, selectedText);
  await owner
    .getByTestId("fixed-toolbar-buttons")
    .getByRole("button", { name: "批注" })
    .click();
  await owner.getByPlaceholder("输入批注内容...").fill(rootComment);
  await owner.getByRole("button", { name: "提交" }).click();
  await expect(owner.getByText(rootComment, { exact: true })).toBeVisible();
  await expect(owner.getByText("已保存")).toBeVisible({ timeout: 15_000 });

  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await loginWithPassword(contributor, "contributor@test.com", "password123");
  await contributor.goto(`/wiki/${slug}`);
  await openDiscussion(contributor);
  await expect(
    contributor.getByRole("button", { name: "标记为已解决" }),
  ).toHaveCount(0);
  await expect(contributor.getByRole("button", { name: "删除" })).toHaveCount(
    0,
  );
  const replyInput = contributor.getByPlaceholder("回复...");
  await replyInput.fill(reply);
  await replyInput.press("Enter");
  await expect(replyInput).toHaveValue("");
  await expect(contributor.getByText(reply, { exact: true })).toBeVisible();

  await contributor.reload();
  await openDiscussion(contributor);
  const messages = contributor.locator("p.text-sm");
  await expect(messages).toHaveText([rootComment, reply]);

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`/wiki/${slug}`);
  await openDiscussion(publicPage);
  await expect(publicPage.getByText(reply, { exact: true })).toBeVisible();
  await expect(publicPage.getByPlaceholder("回复...")).toHaveCount(0);
  await expect(
    publicPage.getByRole("button", { name: "标记为已解决" }),
  ).toHaveCount(0);
  await expect(publicPage.getByRole("button", { name: "删除" })).toHaveCount(0);
  await publicContext.close();

  await owner.goto(`/wiki/${slug}`);
  await openDiscussion(owner);
  await owner.getByRole("button", { name: "标记为已解决" }).click();
  await expect(owner.getByText("批注 (1)")).toHaveCount(0);

  const resolved = await query<{ resolved: boolean }>(
    `select d.resolved
     from discussions d
     join wiki_pages p on p.id = d.page_id
     where p.slug = $1 and d.parent_id is null`,
    [slug],
  );
  expect(resolved.rows).toEqual([{ resolved: true }]);

  await owner.goto(`/wiki/edit/${slug}`);
  await expect(owner.getByText("批注 (1)")).toHaveCount(0);

  await contributorContext.close();
  await ownerContext.close();
});
