import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { createUntitledWikiPage } from "./helpers/wiki";
import { PAGE_IDS } from "../scripts/seed-data";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8");
  const match = env.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error("DATABASE_URL not found");
  return match[1].trim();
}

// Create-flow pages reference the seed admin user, which the seed reset deletes
// by fixed UUID; an orphan page would block the next seed's FK. Hard-delete the
// page (links/revisions cascade) so the suite stays re-runnable.
async function dropPageById(id: string) {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("DELETE FROM wiki_pages WHERE id = $1", [id]);
  } finally {
    await client.end();
  }
}

// ── #95: wiki interlinks ([[) autocomplete + backlinks ──────────────────────
//
// Self-contained: a fresh page is created (create mode has no autosave /
// optimistic-lock to collide with other specs), it links to the seeded
// "Getting Started" page via the [[ picker, then the target page is asserted to
// surface the backlink. Tests run serially, so test 2 relies on test 1's page.

const SOURCE_TITLE = "Link Source Page";
let sourcePageId = "";

test.describe.configure({ mode: "serial" });

test.describe("#95 wiki links", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    if (sourcePageId) await dropPageById(sourcePageId);
  });

  test("typing [[ opens the page picker and inserts an internal link", async ({
    page,
  }) => {
    await createUntitledWikiPage(page);
    sourcePageId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.getByLabel("标题").fill(SOURCE_TITLE);

    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("See [[");

    // The combobox lists existing pages by title; pick the seeded target.
    const option = page.getByRole("option", { name: "Getting Started" });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // The inserted node renders as an internal /wiki link inside the editor.
    await expect(
      editor.locator(`a[href="/wiki/${PAGE_IDS.gettingStarted}"]`),
    ).toHaveText("Getting Started");

    await page.keyboard.press("Control+s");

    await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator(`a[href="/wiki/${PAGE_IDS.gettingStarted}"]`).first(),
    ).toBeVisible();
  });

  test("target page shows the backlink from the source", async ({ page }) => {
    await page.context().clearCookies();
    const backlink = page
      .getByRole("region", { name: "反向链接" })
      .getByRole("link", { name: SOURCE_TITLE });

    // The backlink is derived from a tag-revalidated cache; allow a couple of
    // reloads for invalidation from the create above to propagate.
    await expect(async () => {
      await page.goto(`/wiki/${PAGE_IDS.gettingStarted}`);
      await expect(backlink).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  });
});
