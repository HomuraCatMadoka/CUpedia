import { expect, type Locator, type Page } from "@playwright/test";

const UUID_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const canonicalWikiPageUrl = new RegExp(`/wiki/${UUID_SOURCE}$`, "i");

export function wikiPageUrl(pageId: string) {
  return new RegExp(`/wiki/${pageId}$`);
}

export async function waitForHydratedWikiEditor(page: Page): Promise<Locator> {
  const shell = page.locator(
    '[data-testid="wiki-editor-shell"][data-editor-hydrated="true"]',
  );
  await expect(shell).toHaveCount(1);

  const editor = shell.locator('[data-slate-editor="true"]');
  await expect(editor).toBeVisible();
  return editor;
}

export async function createUntitledWikiPage(page: Page) {
  await page.goto("/wiki");
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "打开 Wiki 目录" }).click();
  }
  await page.getByRole("button", { name: "新建页面" }).first().click();
  await page.waitForURL(/\?draft=1(?:&|$)/, { timeout: 30_000 });
  await waitForHydratedWikiEditor(page);
  const pageId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByLabel("页面标题").fill(`E2E Untitled ${pageId.slice(0, 8)}`);
  await expect(page.getByTestId("wiki-autosave-status")).toHaveText("已保存", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "共享", exact: true }).click();
  await page.getByRole("button", { name: "发布到 Wiki", exact: true }).click();
  await expect(page).toHaveURL(wikiPageUrl(pageId), { timeout: 30_000 });
  return pageId;
}
