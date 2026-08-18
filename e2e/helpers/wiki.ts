import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";

const UUID_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const canonicalWikiPageUrl = new RegExp(`/wiki/${UUID_SOURCE}$`, "i");

export function wikiPageUrl(pageId: string) {
  return new RegExp(`/wiki/${pageId}$`);
}

const publishedPagePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  allowExitOnIdle: true,
});

const EMPTY_WIKI_CONTENT = JSON.stringify([
  { type: "p", children: [{ text: "" }] },
]);

interface PublishedWikiFixtureOptions {
  title?: string;
  content?: string;
  icon?: string | null;
  parentId?: string | null;
}

async function isPublishedWikiPage(pageId: string) {
  const result = await publishedPagePool.query(
    "select 1 from wiki_pages where id = $1",
    [pageId],
  );
  return result.rowCount === 1;
}

export async function openPublishedWikiFixture(
  page: Page,
  options: PublishedWikiFixtureOptions = {},
) {
  const pageId = randomUUID();
  const user = await publishedPagePool.query<{ id: string }>(
    "select id from users where email = $1",
    ["admin@test.com"],
  );
  const adminId = user.rows[0]?.id;
  if (!adminId) throw new Error("Seed admin is missing");

  await publishedPagePool.query(
    `insert into wiki_pages
       (id, title, icon, content, parent_id, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $6)`,
    [
      pageId,
      options.title ?? `E2E fixture ${pageId.slice(0, 8)}`,
      options.icon ?? null,
      options.content ?? EMPTY_WIKI_CONTENT,
      options.parentId ?? null,
      adminId,
    ],
  );
  await page.goto(`/wiki/${pageId}`);
  await waitForHydratedWikiEditor(page, pageId);
  return pageId;
}

export async function dropPublishedWikiFixtures(pageIds: string[]) {
  if (pageIds.length === 0) return;
  await publishedPagePool.query(
    "delete from wiki_pages where id = any($1::uuid[])",
    [pageIds],
  );
}

export async function waitForPublishedWikiPage(
  page: Page,
  pageId: string,
  timeout = 30_000,
) {
  const canonicalPath = `/wiki/${pageId}`;
  await expect
    .poll(
      async () => {
        if (
          new URL(page.url()).pathname + new URL(page.url()).search ===
          canonicalPath
        ) {
          return "navigated";
        }
        return (await isPublishedWikiPage(pageId)) ? "published" : "pending";
      },
      { timeout },
    )
    .not.toBe("pending");

  // Direct navigation coverage belongs to wiki-create.spec.ts. Setup callers
  // only need the published editor, so recover if Next returned the redirect
  // in the action payload without applying it in the browser.
  if (page.url().includes("?draft=1")) {
    try {
      await page.evaluate(
        (path) => window.location.replace(path),
        canonicalPath,
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Execution context was destroyed")
      ) {
        throw error;
      }
    }
  }
  await expect(page).toHaveURL(wikiPageUrl(pageId), { timeout });
}

export async function getHydratedWikiEditorShell(
  page: Page,
  pageId?: string,
): Promise<Locator> {
  const shell = page.locator(
    [
      '[data-testid="wiki-editor-shell"]',
      '[data-editor-hydrated="true"]',
      ...(pageId ? [`[data-wiki-page-id="${pageId}"]`] : []),
    ].join(""),
  );
  await expect(shell).toHaveCount(1);

  const editor = shell.locator('[data-slate-editor="true"]');
  await expect(editor).toBeVisible();
  return shell;
}

export async function waitForHydratedWikiEditor(
  page: Page,
  pageId?: string,
): Promise<Locator> {
  const shell = await getHydratedWikiEditorShell(page, pageId);
  const editor = shell.locator('[data-slate-editor="true"]');
  return editor;
}

export async function createUntitledWikiPage(page: Page) {
  await page.goto("/wiki");
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    const openNavigation = page.getByRole("button", { name: "打开导航" });
    await expect(openNavigation).toHaveAttribute("data-client-ready", "true");
    await openNavigation.click();
    await expect(page.getByRole("dialog", { name: "Wiki 页面" })).toBeVisible();
  }
  const createButton = page.getByRole("button", { name: "新建页面" }).first();
  await expect(createButton).toHaveAttribute("data-client-ready", "true");
  await createButton.click();
  await page.waitForURL(/\?draft=1(?:&|$)/, { timeout: 30_000 });
  const pageId = new URL(page.url()).pathname.split("/").at(-1)!;
  const shell = await getHydratedWikiEditorShell(page, pageId);
  await shell.getByLabel("页面标题").fill(`E2E Untitled ${pageId.slice(0, 8)}`);
  await expect(shell.getByTestId("wiki-autosave-status")).toHaveText("已保存", {
    timeout: 15_000,
  });
  await shell.getByRole("button", { name: "共享", exact: true }).click();
  await page.getByRole("button", { name: "发布到 Wiki", exact: true }).click();

  await waitForPublishedWikiPage(page, pageId);
  return pageId;
}
