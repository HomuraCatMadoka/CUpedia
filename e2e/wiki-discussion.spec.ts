import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, loginWithPassword } from "./helpers/auth";
import { createUntitledWikiPage } from "./helpers/wiki";

const suffix = randomUUID().slice(0, 8);
const title = `Discussion ${suffix}`;
let pageId = "";
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
  const hydratedEditor = page.locator(
    '[data-testid="wiki-editor-shell"][data-editor-hydrated="true"]',
  );
  await expect(hydratedEditor).toHaveCount(1);
  const editor = hydratedEditor.locator('[data-slate-editor="true"]');
  await expect(editor).toHaveCount(1);
  await expect(editor).toBeEditable();
  const points = await editor.evaluate((element, needle) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent?.includes(needle)) {
      node = walker.nextNode();
    }
    if (!node?.textContent) throw new Error(`Text not found: ${needle}`);

    const start = node.textContent.indexOf(needle);
    const startRange = document.createRange();
    startRange.setStart(node, start);
    startRange.setEnd(node, start + 1);
    const startRect = startRange.getBoundingClientRect();
    const endRange = document.createRange();
    endRange.setStart(node, start + needle.length - 1);
    endRange.setEnd(node, start + needle.length);
    const endRect = endRange.getBoundingClientRect();

    return {
      start: { x: startRect.left + 1, y: startRect.top + startRect.height / 2 },
      end: { x: endRect.right - 1, y: endRect.top + endRect.height / 2 },
    };
  }, text);

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.mouse.move(points.start.x, points.start.y);
    await page.mouse.down();
    await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
    await page.mouse.up();
    if (
      (await page.evaluate(() => window.getSelection()?.toString() ?? "")) ===
      text
    ) {
      break;
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }

  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe(text);
}

async function openDiscussion(page: Page) {
  const panelTrigger = page.locator(
    'button[aria-controls="wiki-discussion-panel"]',
  );
  await expect(panelTrigger).toBeVisible();
  if ((await panelTrigger.getAttribute("aria-expanded")) === "false") {
    await panelTrigger.click();
  }
  await page.getByRole("button", { name: new RegExp(rootComment) }).click();
  await expect(page.getByText(rootComment, { exact: true })).toBeVisible();
}

test.afterAll(async () => {
  await query(
    "update site_settings set value = 'admin' where key = 'wiki_edit_role'",
  );
  if (pageId) await query("delete from wiki_pages where id = $1", [pageId]);
});

test("#245 annotation discussion lifecycle and permissions", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await loginAsAdmin(page);
  await createUntitledWikiPage(page);
  pageId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByLabel("标题").fill(title);
  await page.locator('[data-slate-editor="true"]').fill(selectedText);
  await page.keyboard.press("Control+s");
  await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });

  await page.goto("/admin/settings");
  await page.getByRole("switch", { name: "允许普通用户编辑 Wiki" }).click();
  await page.getByRole("button", { name: "确认" }).click();

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await loginWithPassword(owner, "user@test.com", "password123");
  await owner.goto(`/wiki/${pageId}`);
  await selectText(owner, selectedText);
  const textToolbar = owner.getByRole("toolbar", {
    name: "文字格式工具栏",
  });
  await expect(textToolbar).toBeVisible();
  await textToolbar.getByLabel("批注").click();
  await owner.getByPlaceholder("输入批注内容…").fill(rootComment);
  await owner.getByRole("button", { name: "提交" }).click();
  await expect(owner.getByText(rootComment, { exact: true })).toBeVisible();
  await expect(owner.getByText("已保存")).toBeVisible({ timeout: 15_000 });

  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await loginWithPassword(contributor, "contributor@test.com", "password123");
  await contributor.goto(`/wiki/${pageId}`);
  await openDiscussion(contributor);
  await expect(
    contributor.getByRole("button", { name: "标记为已解决" }),
  ).toHaveCount(0);
  await expect(contributor.getByRole("button", { name: "删除" })).toHaveCount(
    0,
  );
  const replyInput = contributor.getByPlaceholder("回复…");
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
  await publicPage.goto(`/wiki/${pageId}`);
  await openDiscussion(publicPage);
  await expect(publicPage.getByText(reply, { exact: true })).toBeVisible();
  await expect(publicPage.getByPlaceholder("回复…")).toHaveCount(0);
  await expect(
    publicPage.getByRole("button", { name: "标记为已解决" }),
  ).toHaveCount(0);
  await expect(publicPage.getByRole("button", { name: "删除" })).toHaveCount(0);
  await publicContext.close();

  await owner.goto(`/wiki/${pageId}`);
  await openDiscussion(owner);
  await owner.getByRole("button", { name: "标记为已解决" }).click();
  await expect(owner.getByText("批注 (1)")).toHaveCount(0);

  await expect
    .poll(async () => {
      const resolved = await query<{ resolved: boolean }>(
        `select d.resolved
         from discussions d
         join wiki_pages p on p.id = d.page_id
         where p.id = $1 and d.parent_id is null`,
        [pageId],
      );
      return resolved.rows;
    })
    .toEqual([{ resolved: true }]);

  await owner.goto(`/wiki/${pageId}`);
  await expect(owner.getByText("批注 (1)")).toHaveCount(0);

  await page.goto("/admin/settings");
  await page.getByRole("switch", { name: "允许普通用户编辑 Wiki" }).click();
  await page.getByRole("button", { name: "确认" }).click();

  await contributorContext.close();
  await ownerContext.close();
});
