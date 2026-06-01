import {
  test,
  expect,
  type Browser,
  type Page,
  type Request,
} from "@playwright/test";

/**
 * Issue #88 — read-only wiki pages render via Plate *static* (no editable
 * slate-react runtime), while the #87 inline-annotation island stays
 * interactive.
 *
 * The seed (`pnpm seed`, run by global-setup) creates `/wiki/annotated`: a page
 * whose body carries one inline comment mark (`seed-annotation-1`) over the
 * phrase "annotated phrase", plus a matching unresolved discussion
 * ("This is a seeded annotation thread." by Admin).
 *
 * What we assert:
 *  - the body renders as static HTML (no `[contenteditable]` mounts — that is
 *    the editable Plate runtime's signature), unlike the edit page;
 *  - the annotation highlight is present and clickable, opening the discussion
 *    thread in the read-only sidebar;
 *  - a signed-in reader (`canComment`) gets the reply affordance;
 *  - the read path transfers materially less JS than the edit path, evidence
 *    the heavy editable runtime chunks are no longer pulled into the read path.
 */

const ANNOTATED = "/wiki/annotated";
const EDIT_ANNOTATED = "/wiki/edit/annotated";
const HIGHLIGHT_TEXT = "annotated phrase";
const THREAD_CONTENT = "This is a seeded annotation thread.";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

/**
 * Sign in through better-auth's REST endpoint (bypasses the client-side CUHK
 * whitelist that the @test.com seed account would fail). The session cookie
 * lands in the browser context jar and is reused by page navigations.
 */
async function login(page: Page) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), `login failed: ${res.status()} ${await res.text()}`).toBe(
    true,
  );
}

/**
 * Track every script request on a page and report its JS footprint. Run each
 * navigation in its own fresh browser context so the HTTP cache never bleeds
 * between the read and edit measurements (a shared cache would let the second
 * navigation reuse common chunks for free and corrupt the comparison).
 */
function trackScripts(page: Page) {
  const urls = new Set<string>();
  const requests: Request[] = [];
  page.on("requestfinished", (req) => {
    if (req.resourceType() !== "script") return;
    urls.add(req.url());
    requests.push(req);
  });
  return {
    count: () => urls.size,
    bytes: async () => {
      let total = 0;
      for (const req of requests) {
        const sizes = await req.sizes().catch(() => null);
        if (sizes) total += sizes.responseBodySize;
      }
      return total;
    },
  };
}

async function measureScripts(
  browser: Browser,
  baseURL: string,
  path: string,
  opts: { login?: boolean; settle: (page: Page) => Promise<void> },
) {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    if (opts.login) await login(page);
    const tracker = trackScripts(page);
    await page.goto(path, { waitUntil: "networkidle" });
    await opts.settle(page);
    return { count: tracker.count(), bytes: await tracker.bytes() };
  } finally {
    await context.close();
  }
}

test.describe("#88 read-only wiki: static render + annotation island", () => {
  test("renders the article body without an editable Plate runtime", async ({
    page,
  }) => {
    const res = await page.goto(ANNOTATED, { waitUntil: "networkidle" });
    expect(res?.status()).toBe(200);

    // Body content is present, rendered by Plate's *static* serializer: the
    // body heading carries `data-slate-type` (static node markup), distinct
    // from the plain page-title <h1>.
    await expect(page.locator('h1[data-slate-type="h1"]')).toHaveText(
      "Annotated Page",
    );
    await expect(page.getByText(HIGHLIGHT_TEXT)).toBeVisible();

    // The editable runtime renders a [contenteditable] textbox; the static read
    // path must not. Its absence is the behavioral proof the editor runtime did
    // not hydrate here.
    await expect(page.locator("[contenteditable]")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("annotation highlight is clickable and opens the discussion thread", async ({
    page,
  }) => {
    await page.goto(ANNOTATED, { waitUntil: "networkidle" });

    // Before interaction the read-only sidebar shows the unresolved count and
    // the thread is in list (button) form, not an open panel.
    await expect(page.getByText(/批注 \(1\)/)).toBeVisible();

    // The highlight is the inline comment leaf wrapping the annotated phrase
    // (CommentLeafStatic renders a clickable span with cursor-pointer).
    const highlight = page
      .locator("span.cursor-pointer", { hasText: HIGHLIGHT_TEXT })
      .first();
    await expect(highlight).toBeVisible();

    // Click activates the comment id -> sidebar swaps from the list to the open
    // DiscussionThread panel (the "批注 (N)" heading disappears).
    await highlight.click();

    await expect(page.getByText(/批注 \(1\)/)).toHaveCount(0);
    await expect(page.getByText(THREAD_CONTENT)).toBeVisible();
    // Author of the seeded thread is rendered inside the open panel.
    await expect(page.getByText("Admin").first()).toBeVisible();
  });

  test("signed-in reader can reply (canComment) from the annotation thread", async ({
    page,
  }) => {
    await login(page);
    await page.goto(ANNOTATED, { waitUntil: "networkidle" });

    const highlight = page
      .locator("span.cursor-pointer", { hasText: HIGHLIGHT_TEXT })
      .first();
    await expect(highlight).toBeVisible();
    await highlight.click();

    // Reply affordance only renders for canComment (logged-in) readers.
    await expect(page.getByPlaceholder("回复...")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "标记为已解决" }),
    ).toBeVisible();
  });

  test("read path ships materially less JS than the edit path", async ({
    browser,
    baseURL,
  }) => {
    // Each navigation runs in an isolated, cold-cache context so the byte and
    // chunk counts reflect what that route actually pulls.
    const read = await measureScripts(browser, baseURL!, ANNOTATED, {
      settle: async (page) => {
        await expect(page.getByText(HIGHLIGHT_TEXT)).toBeVisible();
        // The static read path mounts no editable surface.
        await expect(page.locator("[contenteditable]")).toHaveCount(0);
      },
    });

    const edit = await measureScripts(browser, baseURL!, EDIT_ANNOTATED, {
      login: true,
      settle: async (page) => {
        // The editable Plate runtime mounts at least one [contenteditable].
        expect(
          await page.locator("[contenteditable]").count(),
        ).toBeGreaterThanOrEqual(1);
      },
    });

    expect(read.bytes, "read page should download some JS").toBeGreaterThan(0);
    // The editable Plate/slate-react runtime is bundled into the edit route, so
    // its cold-cache JS payload must clearly exceed the static read route's.
    // (Chunk *count* is not a reliable proxy — Next splits the editor into a
    // few large chunks vs. many small shared ones — so we compare bytes.)
    expect(
      edit.bytes,
      `edit JS=${edit.bytes}B (${edit.count} chunks) should exceed read JS=${read.bytes}B (${read.count} chunks) — the editable runtime must be absent from the read path`,
    ).toBeGreaterThan(read.bytes);
  });
});
