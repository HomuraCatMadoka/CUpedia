import { expect, type Locator, type Page } from "@playwright/test";

const UUID_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const canonicalWikiPageUrl = new RegExp(`/wiki/${UUID_SOURCE}$`, "i");

export function wikiPageUrl(pageId: string) {
  return new RegExp(`/wiki/${pageId}$`);
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
    await page.getByRole("button", { name: "打开导航" }).click();
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
  await expect(page).toHaveURL(wikiPageUrl(pageId), { timeout: 30_000 });
  return pageId;
}
