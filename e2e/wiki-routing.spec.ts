import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { PAGE_IDS } from "../scripts/seed-data";
import { loginAsAdmin } from "./helpers/auth";

const TOMBSTONE_LINK_PARENT_ID = "00000000-0000-4000-c000-0000000000eb";
const TOMBSTONE_LINK_CHILD_ID = "00000000-0000-4000-c000-0000000000ec";

test.describe("UUID canonical wiki routing (ref #447)", () => {
  test("serves existing pages by UUID and rejects a legacy slug", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);
    await expect(page).toHaveURL(new RegExp(`/wiki/${PAGE_IDS.welcome}$`));
    await expect(
      page.getByRole("heading", { name: "Welcome to CUpedia" }),
    ).toBeVisible();

    await page.goto("/wiki/welcome");
    await expect(page).toHaveURL(/\/wiki\/welcome$/);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    await page.goto(`/wiki/edit/${PAGE_IDS.welcome}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    await page.goto("/wiki/history/welcome");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("serves a tombstone for a soft-deleted page UUID", async ({ page }) => {
    await page.goto(`/wiki/${PAGE_IDS.deleted}`);

    await expect(page).toHaveURL(new RegExp(`/wiki/${PAGE_IDS.deleted}$`));
    await expect(
      page.getByRole("heading", { name: "页面已删除" }),
    ).toBeVisible();
    await expect(page.getByTestId("wiki-page-tombstone")).toBeVisible();
    await expect(page.getByRole("heading", { name: "404" })).toHaveCount(0);
    await expect(page.getByText("Deleted Page Demo")).toHaveCount(0);
  });

  test("opens a parent page link to its soft-deleted child as a tombstone", async ({
    page,
  }) => {
    const content = JSON.stringify([
      {
        type: "p",
        children: [
          {
            type: "a",
            pageId: TOMBSTONE_LINK_CHILD_ID,
            url: "/wiki/legacy-slug",
            children: [{ text: "Deleted target" }],
          },
        ],
      },
    ]);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `insert into wiki_pages
           (id, title, content, created_by, updated_by)
         values ($1, 'Tombstone Link Parent', $2, $3, $3)
         on conflict (id) do update set content = excluded.content, deleted_at = null`,
        [
          TOMBSTONE_LINK_PARENT_ID,
          content,
          "00000000-0000-4000-a000-000000000001",
        ],
      );
      await client.query(
        `insert into wiki_pages
           (id, title, content, parent_id, created_by, updated_by, deleted_at)
         values ($1, 'Tombstone Link Child', '[]', $2, $3, $3, now())
         on conflict (id) do update
           set parent_id = excluded.parent_id, deleted_at = excluded.deleted_at`,
        [
          TOMBSTONE_LINK_CHILD_ID,
          TOMBSTONE_LINK_PARENT_ID,
          "00000000-0000-4000-a000-000000000001",
        ],
      );

      await page.goto(`/wiki/${TOMBSTONE_LINK_PARENT_ID}`);
      const link = page.getByRole("link", { name: "Deleted target" });
      await expect(link).toHaveAttribute(
        "href",
        `/wiki/${TOMBSTONE_LINK_CHILD_ID}`,
      );
      await link.click();

      await expect(page).toHaveURL(
        new RegExp(`/wiki/${TOMBSTONE_LINK_CHILD_ID}$`),
      );
      await expect(
        page.getByRole("heading", { name: "页面已删除" }),
      ).toBeVisible();
    } finally {
      await client.query("delete from wiki_pages where id in ($1, $2)", [
        TOMBSTONE_LINK_CHILD_ID,
        TOMBSTONE_LINK_PARENT_ID,
      ]);
      await client.end();
    }
  });

  test("emits UUID links from navigation, search, and page history", async ({
    page,
  }) => {
    await page.goto(`/wiki/${PAGE_IDS.dining}`);

    await expect(
      page.locator(
        `[data-wiki-tree-link][href="/wiki/${PAGE_IDS.campusLife}"]`,
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "面包屑导航" })
        .getByRole("link", { name: "Campus Life" }),
    ).toHaveAttribute("href", `/wiki/${PAGE_IDS.campusLife}`);
    await expect(page.getByRole("link", { name: "历史" })).toHaveAttribute(
      "href",
      `/wiki/history/${PAGE_IDS.dining}`,
    );

    await page.goto("/wiki/search?q=Dining");
    await expect(
      page
        .locator("a.block.rounded-lg.border")
        .filter({ hasText: "Dining on Campus" }),
    ).toHaveAttribute("href", `/wiki/${PAGE_IDS.dining}`);
  });

  test("shares the canonical UUID URL from the editor", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async ({ url }: ShareData) => {
          sessionStorage.setItem("shared-url", url ?? "");
        },
      });
    });
    await loginAsAdmin(page);
    await page.goto(`/wiki/${PAGE_IDS.welcome}`);

    await page.getByRole("button", { name: "分享页面" }).click();

    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("shared-url")))
      .toBe(`${new URL(page.url()).origin}/wiki/${PAGE_IDS.welcome}`);
  });
});
