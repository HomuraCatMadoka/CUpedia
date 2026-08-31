// ref #816
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { loginWithPassword } from "./helpers/auth";
import { installFakeCampusMapAmap } from "./helpers/campus-map-amap";

const ids = {
  place: "00000000-0000-4000-8000-000000008161",
  changeset: "00000000-0000-4000-8000-000000008162",
  change: "00000000-0000-4000-8000-000000008163",
  revision: "00000000-0000-4000-8000-000000008164",
  actor: "00000000-0000-4000-8000-000000008165",
} as const;

const placeName = "范克廉楼地下饮水点";
const mapPlaceUrl = `/campus-map?v=1&scene=place&id=${ids.place}&snap=peek`;

async function withDatabase(
  action: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await action(client);
  } finally {
    await client.end();
  }
}

async function removePlaceFixture(client: Client) {
  const rows = await client.query<{
    revision_id: string;
    changeset_id: string;
    provenance_id: string | null;
  }>(
    `select r.id revision_id, r.changeset_id, rp.provenance_id
       from campus_map_fact_revisions r
       left join campus_map_revision_provenance rp on rp.revision_id = r.id
      where r.place_id = $1`,
    [ids.place],
  );
  const revisionIds = [...new Set(rows.rows.map((row) => row.revision_id))];
  const changesetIds = [...new Set(rows.rows.map((row) => row.changeset_id))];
  const provenanceIds = [
    ...new Set(
      rows.rows.flatMap((row) =>
        row.provenance_id === null ? [] : [row.provenance_id],
      ),
    ),
  ];

  if (changesetIds.length > 0) {
    await client.query(
      "delete from campus_map_publish_requests where changeset_id = any($1::uuid[])",
      [changesetIds],
    );
  }
  await client.query(
    "delete from campus_map_current_facts where place_id = $1",
    [ids.place],
  );
  await client.query(
    "delete from campus_map_current_revisions where place_id = $1",
    [ids.place],
  );
  if (revisionIds.length > 0) {
    await client.query(
      "delete from campus_map_revision_provenance where revision_id = any($1::uuid[])",
      [revisionIds],
    );
    await client.query(
      "delete from campus_map_revision_visibility where revision_id = any($1::uuid[])",
      [revisionIds],
    );
    await client.query(
      "delete from campus_map_fact_revisions where id = any($1::uuid[])",
      [revisionIds],
    );
  }
  await client.query(
    "delete from campus_map_place_changes where place_id = $1",
    [ids.place],
  );
  if (changesetIds.length > 0) {
    await client.query(
      "delete from campus_map_changesets where id = any($1::uuid[])",
      [changesetIds],
    );
  }
  await client.query("delete from campus_map_places where id = $1", [
    ids.place,
  ]);
  if (provenanceIds.length > 0) {
    await client.query(
      "delete from campus_map_provenance_sources where id = any($1::uuid[])",
      [provenanceIds],
    );
  }
  await client.query("delete from campus_map_fact_schemas where version = 816");
}

async function resetPlaceFixture() {
  await withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      await removePlaceFixture(client);
      await client.query(
        `insert into campus_map_fact_schemas
           (version, status, definition, display_metadata)
         values (816, 'draft', '{"fields":{},"pinTypes":{}}', '{}')`,
      );
      await client.query("insert into campus_map_places (id) values ($1)", [
        ids.place,
      ]);
      await client.query(
        `insert into campus_map_changesets
           (id, actor_id_snapshot, actor_nickname_snapshot, comment,
            source_summary, client_name, client_version, affected_count,
            created_count, published_at)
         values ($1, $2, '地图贡献者', '建立地点', '现场核对', 'e2e', '1', 1, 1,
           '2026-08-30T01:00:00Z')`,
        [ids.changeset, ids.actor],
      );
      await client.query(
        `insert into campus_map_place_changes
           (id, changeset_id, place_id, operation, field_diff)
         values ($1, $2, $3, 'create', '{}')`,
        [ids.change, ids.changeset, ids.place],
      );
      await client.query(
        `insert into campus_map_fact_revisions
           (id, place_id, changeset_id, place_change_id, fact_schema_version,
            field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
            name, pin_type, capabilities, gender, wheelchair_access, audience,
            credential_requirement, access_schedule, reservation_requirement,
            temporary_status, location_kind, point_precision, longitude,
            latitude, coordinate_crs, observed_at, verified_at, created_at)
         values ($1, $2, $3, $4, 816, '{}', 'active', $5, '地图贡献者',
           $6, 'water', '{}', 'unknown', 'yes', 'cuhk-member', 'campus-card',
           '{"kind":"always"}', 'none', 'normal', 'outdoor-point', 'precise',
           114.208321, 22.419876, 'wgs84', '2026-08-30T00:00:00Z',
           '2026-08-30T01:00:00Z', '2026-08-30T01:00:00Z')`,
        [
          ids.revision,
          ids.place,
          ids.changeset,
          ids.change,
          ids.actor,
          placeName,
        ],
      );
      await client.query(
        "insert into campus_map_revision_visibility (revision_id) values ($1)",
        [ids.revision],
      );
      await client.query(
        `insert into campus_map_current_revisions (place_id, revision_id, status)
         values ($1, $2, 'active')`,
        [ids.place, ids.revision],
      );
      await client.query(
        `insert into campus_map_current_facts
           (place_id, revision_id, fact_schema_version, name, pin_type,
            capabilities, gender, wheelchair_access, audience,
            credential_requirement, access_schedule, reservation_requirement,
            temporary_status, location_kind, point_precision, longitude,
            latitude, coordinate_crs, observed_at, verified_at, published_at)
         values ($1, $2, 816, $3, 'water', '{}', 'unknown', 'yes',
           'cuhk-member', 'campus-card', '{"kind":"always"}', 'none', 'normal',
           'outdoor-point', 'precise', 114.208321, 22.419876, 'wgs84',
           '2026-08-30T00:00:00Z', '2026-08-30T01:00:00Z',
           '2026-08-30T01:00:00Z')`,
        [ids.place, ids.revision, placeName],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function cleanupPlaceFixture() {
  await withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      await removePlaceFixture(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function loginAsUser(page: Page) {
  await loginWithPassword(page, "user@test.com", "password123");
}

test.describe.serial("Campus Map Place details and admin lifecycle", () => {
  test.beforeEach(resetPlaceFixture);
  test.afterAll(cleanupPlaceFixture);

  for (const viewport of [
    { name: "390px", width: 390, height: 844 },
    { name: "720px", width: 720, height: 844 },
    { name: "desktop", width: 1280, height: 800 },
  ]) {
    test(`${viewport.name} keeps the direct Place detail readable after refresh`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await loginAsUser(page);

      await page.goto(`/campus-map/places/${ids.place}`);
      await expect(
        page.getByRole("heading", { name: placeName }),
      ).toBeVisible();
      await expect(page.getByText("使用中", { exact: true })).toBeVisible();
      await expect(page.getByText("饮水点", { exact: true })).toBeVisible();
      await expect(page.getByText("室外 · 精确位置")).toBeVisible();
      await expect(page.getByText("中大成员", { exact: true })).toBeVisible();
      await expect(page.getByText("校园卡", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "查看编辑记录" }),
      ).toHaveAttribute("href", `/campus-map/places/${ids.place}/history`);
      await expect(page.getByRole("button", { name: "停用地点" })).toHaveCount(
        0,
      );
      await expect(page.getByRole("button", { name: "恢复地点" })).toHaveCount(
        0,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      await page.reload();
      await expect(
        page.getByRole("heading", { name: placeName }),
      ).toBeVisible();
      await expect(page.getByText("使用中", { exact: true })).toBeVisible();
    });
  }

  test("the compact card, Back, and return link preserve the active Place selection", async ({
    page,
  }) => {
    await installFakeCampusMapAmap(page);
    await loginAsUser(page);
    await page.goto(mapPlaceUrl);

    await expect(page.getByRole("heading", { name: placeName })).toBeVisible();
    const details = page.getByRole("link", { name: "查看完整详情" });
    await expect(details).toHaveAttribute(
      "href",
      `/campus-map/places/${ids.place}`,
    );
    await details.click();
    await expect(page).toHaveURL(
      new RegExp(`/campus-map/places/${ids.place}$`),
    );

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`scene=place&id=${ids.place}`));
    await expect(page.getByRole("heading", { name: placeName })).toBeVisible();

    await page.getByRole("link", { name: "查看完整详情" }).click();
    await page.getByRole("link", { name: "返回地图" }).click();
    await expect(page).toHaveURL(new RegExp(`scene=place&id=${ids.place}`));
    await expect(page.getByRole("heading", { name: placeName })).toBeVisible();
  });

  test("an admin can retire and restore while stale lifecycle actions fail safely", async ({
    browser,
    page,
  }) => {
    await installFakeCampusMapAmap(page);
    await loginWithPassword(page, "admin@test.com", "password123");
    await page.goto(`/campus-map/places/${ids.place}`);

    const staleContext = await browser.newContext();
    const stalePage = await staleContext.newPage();
    await loginWithPassword(stalePage, "admin@test.com", "password123");
    await stalePage.goto(`/campus-map/places/${ids.place}`);

    const retireTrigger = page.getByRole("button", { name: "停用地点" });
    await retireTrigger.focus();
    await retireTrigger.click();
    const retireReason = page.getByRole("textbox", { name: "停用原因" });
    await expect(retireReason).toBeFocused();
    await retireReason.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "确认停用这个地点？" }),
    ).toHaveCount(0);
    await expect(retireTrigger).toBeFocused();

    await retireTrigger.click();
    const retireSubmit = page.getByRole("button", {
      name: "确认停用：停用原因",
    });
    await retireSubmit.click();
    await expect(page.getByRole("alert")).toHaveText("请填写原因。");
    await expect(retireReason).toBeFocused();

    const retirementReason = "现场确认该饮水点已拆除";
    await retireReason.fill(retirementReason);
    await page.route("**/campus-map/places/**", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await route.continue();
    });
    await retireSubmit.click();
    await expect(retireSubmit).toContainText("正在停用…");
    await expect(retireSubmit).toBeDisabled();
    await expect(page.getByText("这个地点已停用")).toBeVisible();
    await page.unroute("**/campus-map/places/**");

    await expect(page.getByText(`停用原因：${retirementReason}`)).toBeVisible();
    await expect(page.getByText(`稳定地点编号：${ids.place}`)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "查看编辑记录" }),
    ).toHaveAttribute("href", `/campus-map/places/${ids.place}/history`);
    await page.reload();
    await expect(page.getByText("这个地点已停用")).toBeVisible();
    await expect(
      page.getByText(retirementReason, { exact: false }),
    ).toBeVisible();

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await loginAsUser(readerPage);
    await readerPage.goto(`/campus-map/places/${ids.place}`);
    await expect(
      readerPage.getByRole("heading", { name: placeName }),
    ).toBeVisible();
    await expect(readerPage.getByText("这个地点已停用")).toBeVisible();
    await expect(
      readerPage.getByText(retirementReason, { exact: false }),
    ).toBeVisible();
    await expect(
      readerPage.getByText(`稳定地点编号：${ids.place}`),
    ).toBeVisible();
    await expect(
      readerPage.getByRole("link", { name: "查看编辑记录" }),
    ).toBeVisible();
    await expect(
      readerPage.getByRole("button", { name: "恢复地点" }),
    ).toHaveCount(0);
    await readerContext.close();

    await stalePage.getByRole("button", { name: "停用地点" }).click();
    await stalePage
      .getByRole("textbox", { name: "停用原因" })
      .fill("过期页面提交");
    await stalePage.getByRole("button", { name: "确认停用：停用原因" }).click();
    await expect(stalePage.getByRole("alert")).toContainText(
      "地点已被其他人更新",
    );
    await staleContext.close();

    await page.getByRole("button", { name: "恢复地点" }).click();
    const restoreReason = page.getByRole("textbox", { name: "恢复原因" });
    await expect(restoreReason).toBeFocused();
    await restoreReason.fill("现场确认已重新开放");
    await page.getByRole("button", { name: "确认恢复：恢复原因" }).click();
    await expect(page.getByText("使用中", { exact: true })).toBeVisible();
    await expect(page.getByText("这个地点已停用")).toHaveCount(0);

    await page.getByRole("link", { name: "返回地图" }).click();
    await expect(page).toHaveURL(new RegExp(`scene=place&id=${ids.place}`));
    await expect(page.getByRole("heading", { name: placeName })).toBeVisible();
  });
});
