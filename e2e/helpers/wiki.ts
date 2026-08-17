import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

const UUID_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const canonicalWikiPageUrl = new RegExp(`/wiki/${UUID_SOURCE}$`, "i");

export function wikiPageUrl(pageId: string) {
  return new RegExp(`/wiki/${pageId}$`);
}

async function isPublishedWikiPage(pageId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      "select 1 from wiki_pages where id = $1",
      [pageId],
    );
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
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
      { timeout: 30_000 },
    )
    .not.toBe("pending");

  // Creation/publish navigation is asserted directly in wiki-create.spec.ts.
  // Setup callers only need the published editor, so recover if Next returned
  // the redirect in the action payload without applying it in the browser.
  if (page.url().includes("?draft=1")) {
    await page.reload();
  }
  await expect(page).toHaveURL(wikiPageUrl(pageId), { timeout: 30_000 });
  return pageId;
}
