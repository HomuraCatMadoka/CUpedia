import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

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
async function dropPageBySlug(slug: string) {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("DELETE FROM wiki_pages WHERE slug = $1", [slug]);
  } finally {
    await client.end();
  }
}

async function login(page: Page) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (res.ok()) return;
    last = `${res.status()} ${await res.text()}`;
    if (res.status() !== 429) break;
    await page.waitForTimeout(2000);
  }
  expect(false, `login failed: ${last}`).toBe(true);
}

// ── #95: wiki interlinks ([[) autocomplete + backlinks ──────────────────────
//
// Self-contained: a fresh page is created (create mode has no autosave /
// optimistic-lock to collide with other specs), it links to the seeded
// "Getting Started" page via the [[ picker, then the target page is asserted to
// surface the backlink. Tests run serially, so test 2 relies on test 1's page.

const SOURCE_SLUG = `link-source-${Date.now()}`;
const SOURCE_TITLE = "Link Source Page";

test.describe.configure({ mode: "serial" });

test.describe("#95 wiki links", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterAll(async () => {
    await dropPageBySlug(SOURCE_SLUG);
  });

  test("typing [[ opens the page picker and inserts an internal link", async ({
    page,
  }) => {
    await page.goto("/wiki/new");

    await page.getByLabel("标题").fill(SOURCE_TITLE);
    await page.getByLabel("URL 路径").fill(SOURCE_SLUG);

    const editor = page.locator('[role="textbox"]').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("See [[");

    // The combobox lists existing pages by title; pick the seeded target.
    const option = page.getByRole("option", { name: "Getting Started" });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // The inserted node renders as an internal /wiki link inside the editor.
    await expect(editor.locator('a[href="/wiki/getting-started"]')).toHaveText(
      "Getting Started",
    );

    await page.getByRole("button", { name: "保存" }).click();

    // Create persists then redirects to the new read-only page, where the
    // internal link is rendered.
    await page.waitForURL(`**/wiki/${SOURCE_SLUG}`, { timeout: 15_000 });
    await expect(
      page.locator('a[href="/wiki/getting-started"]').first(),
    ).toBeVisible();
  });

  test("target page shows the backlink from the source", async ({ page }) => {
    const backlink = page
      .getByRole("region", { name: "反向链接" })
      .getByRole("link", { name: SOURCE_TITLE });

    // The backlink is derived from a tag-revalidated cache; allow a couple of
    // reloads for invalidation from the create above to propagate.
    await expect(async () => {
      await page.goto("/wiki/getting-started", { waitUntil: "networkidle" });
      await expect(backlink).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  });
});
