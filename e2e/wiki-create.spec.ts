import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { loginAsAdmin } from "./helpers/auth";

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

test.describe("#448 Notion-style page creation", () => {
  test.setTimeout(60_000);

  test("creates one permanent public page before editing begins", async ({
    page,
    browser,
  }) => {
    let pageId: string | null = null;
    await loginAsAdmin(page);
    try {
      await page.goto("/wiki");
      await page.getByRole("button", { name: "新建页面" }).first().click();

      await expect(page).toHaveURL(
        /\/wiki\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        { timeout: 30_000 },
      );
      await expect(page.getByTestId("wiki-editor-shell")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "完成", exact: true }),
      ).toBeHidden();

      pageId = new URL(page.url()).pathname.split("/").at(-1)!;
      const created = await query<{ title: string; revisions: string }>(
        `select p.title, count(r.id)::text as revisions
         from wiki_pages p
         left join wiki_revisions r on r.page_id = p.id
         where p.id = $1
         group by p.id`,
        [pageId],
      );
      expect(created.rows).toEqual([{ title: "", revisions: "1" }]);

      const anonymous = await browser.newPage();
      await anonymous.goto(`/wiki/${pageId}`);
      await expect(
        anonymous.getByRole("heading", { name: "未命名" }),
      ).toBeVisible();
      await expect(anonymous.getByTestId("wiki-editor-shell")).toHaveCount(0);
      await anonymous.close();

      await page.getByLabel("页面标题").fill("即时公开页面");
      await page.locator('[data-slate-editor="true"]').fill("自动保存正文");
      await expect(page.getByText("已保存")).toBeVisible({ timeout: 15_000 });

      await page.setViewportSize({ width: 393, height: 852 });
      const canonicalUrl = page.url();
      await page.getByRole("button", { name: "完成", exact: true }).click();
      await expect(page).toHaveURL(canonicalUrl);
      await expect(page.getByLabel("页面标题")).not.toBeFocused();
    } finally {
      if (pageId) {
        await query("delete from wiki_pages where id = $1", [pageId]);
      }
    }
  });

  test("GET /wiki/new never creates a page", async ({ page }) => {
    await loginAsAdmin(page);
    const before = await query<{ count: string }>(
      "select count(*)::text as count from wiki_pages",
    );

    await page.goto("/wiki/new");
    await expect(page).toHaveURL(/\/wiki$/);

    const after = await query<{ count: string }>(
      "select count(*)::text as count from wiki_pages",
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
