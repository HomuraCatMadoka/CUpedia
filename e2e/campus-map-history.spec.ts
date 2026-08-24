import { expect, test } from "@playwright/test";
import { Client } from "pg";

const ids = {
  actor: "00000000-0000-4000-8000-000000007191",
  place: "00000000-0000-4000-8000-000000007192",
  createChangeset: "00000000-0000-4000-8000-000000007193",
  createChange: "00000000-0000-4000-8000-000000007194",
  createRevision: "00000000-0000-4000-8000-000000007195",
  retireChangeset: "00000000-0000-4000-8000-000000007196",
  retireChange: "00000000-0000-4000-8000-000000007197",
  retireRevision: "00000000-0000-4000-8000-000000007198",
  emptyPlace: "00000000-0000-4000-8000-000000007199",
} as const;

async function ensureFixture() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      `insert into campus_map_fact_schemas
         (version, status, definition, display_metadata)
       values (719, 'draft',
         '{"fields":{"name":{"kind":"text"},"location":{"kind":"location","variants":["outdoor-point"],"pointPrecisions":["approximate","precise"],"canonicalCrs":"wgs84"}},"pinTypes":{"water":{"applicableFields":["name","location"],"requiredFields":["name","location"]}}}',
         '{"name":{"label":"历史名称"},"location":{"label":"历史位置"}}')
       on conflict (version) do nothing`,
    );
    await client.query(
      `insert into campus_map_places (id) values ($1), ($2) on conflict do nothing`,
      [ids.place, ids.emptyPlace],
    );
    await client.query(
      `insert into campus_map_changesets
         (id, actor_id_snapshot, actor_nickname_snapshot, comment, source_summary,
          review_requested, client_name, client_version, affected_count,
          created_count, bbox_west, bbox_south, bbox_east, bbox_north, published_at)
       values ($1,$2,'地图贡献者','建立历史测试地点','现场观察',true,
         'private-e2e-client','private-fingerprint',1,1,114.2,22.4,114.2,22.4,
         '2026-08-20T01:00:00Z') on conflict do nothing`,
      [ids.createChangeset, ids.actor],
    );
    await client.query(
      `insert into campus_map_place_changes
         (id, changeset_id, place_id, operation, field_diff)
       values ($1,$2,$3,'create',
         '{"name":{"before":null,"after":"历史测试饮水点","label":"历史名称"},"location":{"before":null,"after":{"kind":"outdoor-point","longitude":114.2,"latitude":22.4},"label":"历史位置"}}')
       on conflict do nothing`,
      [ids.createChange, ids.createChangeset, ids.place],
    );
    await client.query(
      `insert into campus_map_fact_revisions
         (id, place_id, changeset_id, place_change_id, fact_schema_version,
          field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
          name, pin_type, location_kind, point_precision, longitude, latitude,
          coordinate_crs, created_at)
       values ($1,$2,$3,$4,719,
         '{"name":{"label":"历史名称"},"location":{"label":"历史位置"}}',
         'active',$5,'地图贡献者','历史测试饮水点','water','outdoor-point',
         'precise',114.2,22.4,'wgs84','2026-08-20T01:00:00Z')
       on conflict do nothing`,
      [
        ids.createRevision,
        ids.place,
        ids.createChangeset,
        ids.createChange,
        ids.actor,
      ],
    );
    await client.query(
      `insert into campus_map_revision_visibility (revision_id)
       values ($1) on conflict do nothing`,
      [ids.createRevision],
    );
    await client.query(
      `insert into campus_map_changesets
         (id, actor_id_snapshot, actor_nickname_snapshot, comment, source_summary,
          client_name, client_version, affected_count, retired_count, published_at)
       values ($1,$2,'地图贡献者','地点已停用','现场复核','private-e2e-client',
         'private-fingerprint',1,1,'2026-08-21T01:00:00Z') on conflict do nothing`,
      [ids.retireChangeset, ids.actor],
    );
    await client.query(
      `insert into campus_map_place_changes
         (id, changeset_id, place_id, operation, field_diff)
       values ($1,$2,$3,'retire','{}') on conflict do nothing`,
      [ids.retireChange, ids.retireChangeset, ids.place],
    );
    await client.query(
      `insert into campus_map_fact_revisions
         (id, place_id, changeset_id, place_change_id, previous_revision_id,
          fact_schema_version, field_metadata, status, actor_id_snapshot,
          actor_nickname_snapshot, name, pin_type, location_kind, point_precision,
          longitude, latitude, coordinate_crs, created_at)
       values ($1,$2,$3,$4,$5,719,
         '{"name":{"label":"历史名称"},"location":{"label":"历史位置"}}',
         'retired',$6,'地图贡献者','历史测试饮水点','water','outdoor-point',
         'precise',114.2,22.4,'wgs84','2026-08-21T01:00:00Z')
       on conflict do nothing`,
      [
        ids.retireRevision,
        ids.place,
        ids.retireChangeset,
        ids.retireChange,
        ids.createRevision,
        ids.actor,
      ],
    );
    await client.query(
      `insert into campus_map_revision_visibility (revision_id)
       values ($1) on conflict do nothing`,
      [ids.retireRevision],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

test.beforeEach(ensureFixture);

for (const viewport of [
  { name: "390px", width: 390, height: 844 },
  { name: "720px", width: 720, height: 900 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test(`${viewport.name} keeps Place history deep links usable`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/campus-map/places/${ids.place}`);
    await page.getByRole("link", { name: /History/ }).click();

    await expect(
      page.getByRole("heading", { name: "历史测试饮水点的修订历史" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    const revisionLink = page.getByRole("link", { name: "查看修订" }).first();
    await revisionLink.focus();
    await expect(revisionLink).toBeFocused();
    await revisionLink.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/history/${ids.retireRevision}$`));

    await page.getByRole("link", { name: "查看 Changeset" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/campus-map/changesets/${ids.retireChangeset}$`),
    );
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/history/${ids.retireRevision}$`));
    await page.goForward();
    await expect(page).toHaveURL(
      new RegExp(`/campus-map/changesets/${ids.retireChangeset}$`),
    );
  });
}

test("shows empty and safe invalid-cursor states", async ({ page }) => {
  await page.goto(`/campus-map/places/${ids.emptyPlace}/history`);
  await expect(page.getByText("暂无公开历史")).toBeVisible();

  await page.goto("/campus-map/changesets?cursor=not-a-cursor");
  const safeAlert = page.getByText(
    "无法读取编辑记录。请检查范围或分页链接后重试。",
  );
  await expect(safeAlert).toBeVisible();
  await expect(safeAlert).not.toContainText("database");
});
