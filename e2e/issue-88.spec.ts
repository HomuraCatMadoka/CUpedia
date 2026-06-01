import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import dotenv from "dotenv";
import { Pool } from "pg";

/**
 * Issue #88 — read-only wiki pages render via Plate *static* (no editable
 * Slate runtime), while the #87 inline-comment interaction is preserved as a
 * lightweight client island.
 *
 * The fixture below upserts the annotated page + a matching discussion thread
 * directly via SQL so the spec is robust even if a parallel run reseeds the
 * shared dev DB. The page tree is served via `unstable_cache`, so the upsert
 * runs before the server first reads the route.
 */

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SEED_EMAIL = "admin@test.com";
const SEED_PASSWORD = "password123";
const ADMIN_ID = "00000000-0000-4000-a000-000000000001";
// Fixture ids live in a high range the seed never touches (seed pages use
// ...c000-0001‥0008). Reusing a seed id would make the `on conflict (id)`
// upsert below keep the seed row's slug, so /wiki/annotated would 404.
const PAGE_ID = "00000000-0000-4000-c000-0000000000e8";
const REV_ID = "00000000-0000-4000-d000-0000000000e8";
const DISCUSSION_ID = "00000000-0000-4000-e000-0000000000e8";
const MARK_ID = "seed-annotation-1";
const THREAD = "This is a seeded annotation thread.";

const CONTENT = JSON.stringify([
  { type: "h1", children: [{ text: "Annotated Page" }] },
  {
    type: "p",
    children: [
      { text: "This sentence has an " },
      { text: "annotated phrase", comment: true, [`comment_${MARK_ID}`]: true },
      { text: " for the reader." },
    ],
  },
]);

async function ensureFixture() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `insert into wiki_pages (id, slug, title, content, parent_id, sort_order, created_by, updated_by)
       values ($1,'annotated','Annotated Page',$2,null,3,$3,$3)
       on conflict (id) do update set content = excluded.content, deleted_at = null`,
      [PAGE_ID, CONTENT, ADMIN_ID],
    );
    await pool.query(
      `insert into wiki_revisions (id, page_id, title, content, edited_by, edit_summary)
       values ($1,$2,'Annotated Page',$3,$4,'fixture') on conflict (id) do nothing`,
      [REV_ID, PAGE_ID, CONTENT, ADMIN_ID],
    );
    await pool.query(
      `insert into discussions (id, page_id, comment_mark_id, user_id, content, resolved)
       values ($1,$2,$3,$4,$5,false)
       on conflict (id) do update set page_id = excluded.page_id, content = excluded.content`,
      [DISCUSSION_ID, PAGE_ID, MARK_ID, ADMIN_ID, THREAD],
    );
  } finally {
    await pool.end();
  }
}

async function signIn(page: Page, baseURL: string) {
  const res = await page.request.post(`${baseURL}/api/auth/sign-in/email`, {
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  return res.ok();
}

test.beforeEach(async () => {
  await ensureFixture();
});

test.describe("#88 read path: static render + clickable annotations", () => {
  test("renders body and keeps inline annotation clickable", async ({
    page,
    baseURL,
  }) => {
    const ok = await signIn(page, baseURL!);
    test.skip(!ok, "could not sign in with seed account");

    await page.goto("/wiki/annotated", { waitUntil: "networkidle" });

    // Body rendered via static Plate.
    await expect(page.getByText("annotated phrase")).toBeVisible();

    // The highlight is the yellow-bordered comment leaf.
    const highlight = page.locator("span.border-yellow-400").first();
    await expect(highlight).toBeVisible();

    // The linked discussion thread is reachable (client island consumes the
    // discussion context). The unresolved thread is listed; clicking the
    // highlight activates it.
    await highlight.click();
    await expect(page.getByText(THREAD).first()).toBeVisible();
  });

  test("read page does not mount the editable Slate surface", async ({
    page,
    baseURL,
  }) => {
    const ok = await signIn(page, baseURL!);
    test.skip(!ok, "could not sign in with seed account");

    await page.goto("/wiki/annotated", { waitUntil: "networkidle" });
    await expect(page.getByText("annotated phrase")).toBeVisible();

    // Static render emits no contenteditable editing surface.
    await expect(page.locator("[contenteditable]")).toHaveCount(0);
  });
});
