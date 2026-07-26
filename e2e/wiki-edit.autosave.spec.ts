import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

const MERGE_SLUG = "getting-started";

async function appendAfterText(page: Page, anchor: string, marker: string) {
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible();

  const text = editor
    .locator('[data-slate-node="text"]')
    .filter({ hasText: anchor })
    .first();
  await expect(text).toBeVisible();
  await text.click();
  await page.keyboard.press("End");
  await page.keyboard.type(` ${marker}`);

  await expect(editor).toContainText(marker);
  await expect(page.getByText("未保存")).toBeVisible();
}

test.describe("#431 authoritative autosave baseline", () => {
  test("a clean merge is adopted before a later save, preserving both editors", async ({
    browser,
  }) => {
    const markerA = `editor-a-${Date.now()}`;
    const markerB = `editor-b-${Date.now()}`;
    const trailingMarker = `editor-a-trailing-${Date.now()}`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA);
    await pageA.goto(`/wiki/edit/${MERGE_SLUG}`);
    await expect(pageA.locator('[role="textbox"]').first()).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB);
    await pageB.goto(`/wiki/edit/${MERGE_SLUG}`);
    await expect(pageB.locator('[role="textbox"]').first()).toBeVisible();

    // B advances the server copy by editing a different top-level block.
    await appendAfterText(pageB, "New to CUHK?", markerB);
    await pageB.getByRole("button", { name: "保存" }).click();
    await expect(pageB).toHaveURL(new RegExp(`/wiki/${MERGE_SLUG}$`));

    // A is still on the original baseline. Its non-overlapping edit should
    // clean-merge and the editor should adopt the authoritative merged copy.
    await appendAfterText(pageA, "for course registration.", markerA);
    await expect(pageA.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(pageA.locator('[role="textbox"]').first()).toContainText(
      markerB,
    );

    // A continues from that merged copy. A later optimistic write must not
    // overwrite B's already-merged block.
    await appendAfterText(pageA, "Registration", trailingMarker);
    await expect(pageA.getByText("已保存")).toBeVisible({ timeout: 15_000 });

    // Re-open the edit route to prove the server retained all three changes.
    await pageA.goto(`/wiki/edit/${MERGE_SLUG}`);
    const persistedEditor = pageA.locator('[role="textbox"]').first();
    await expect(persistedEditor).toContainText(markerA);
    await expect(persistedEditor).toContainText(markerB);
    await expect(persistedEditor).toContainText(trailingMarker);

    await contextA.close();
    await contextB.close();
  });
});
