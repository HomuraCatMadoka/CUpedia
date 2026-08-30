// ref #719, #649
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
  survivorPlace: "00000000-0000-4000-8000-000000007200",
  survivorChangeset: "00000000-0000-4000-8000-000000007201",
  survivorChange: "00000000-0000-4000-8000-000000007202",
  survivorRevision: "00000000-0000-4000-8000-000000007203",
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
      `insert into campus_map_places (id) values ($1), ($2), ($3) on conflict do nothing`,
      [ids.place, ids.emptyPlace, ids.survivorPlace],
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
    await client.query(
      `insert into campus_map_changesets
         (id, actor_id_snapshot, actor_nickname_snapshot, comment, source_summary,
          client_name, client_version, affected_count, created_count, published_at)
       values ($1,$2,'地图贡献者','建立保留地点','现场复核','private-e2e-client',
         'private-fingerprint',1,1,'2026-08-19T01:00:00Z') on conflict do nothing`,
      [ids.survivorChangeset, ids.actor],
    );
    await client.query(
      `insert into campus_map_place_changes
         (id, changeset_id, place_id, operation, field_diff)
       values ($1,$2,$3,'create','{}') on conflict do nothing`,
      [ids.survivorChange, ids.survivorChangeset, ids.survivorPlace],
    );
    await client.query(
      `insert into campus_map_fact_revisions
         (id, place_id, changeset_id, place_change_id, fact_schema_version,
          field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
          name, pin_type, location_kind, point_precision, longitude, latitude,
          coordinate_crs, created_at)
       values ($1,$2,$3,$4,719,'{"name":{"label":"历史名称"}}','active',
         $5,'地图贡献者','保留地点','water','outdoor-point','approximate',
         114.201,22.401,'wgs84','2026-08-19T01:00:00Z') on conflict do nothing`,
      [
        ids.survivorRevision,
        ids.survivorPlace,
        ids.survivorChangeset,
        ids.survivorChange,
        ids.actor,
      ],
    );
    await client.query(
      `insert into campus_map_revision_visibility (revision_id)
       values ($1) on conflict do nothing`,
      [ids.survivorRevision],
    );
    await client.query(
      `insert into campus_map_current_revisions (place_id, revision_id, status)
       values ($1, $2, 'retired'), ($3, $4, 'active')
       on conflict do nothing`,
      [ids.place, ids.retireRevision, ids.survivorPlace, ids.survivorRevision],
    );
    await client.query(
      `insert into campus_map_changesets
         (id, actor_id_snapshot, actor_nickname_snapshot, comment, source_summary,
          client_name, client_version, affected_count, updated_count, published_at)
       select md5('issue-719-feed-' || value::text)::uuid, $1, '分页贡献者',
         '分页 Changeset ' || value::text, '公开摘要', 'private-e2e-client',
         'private-fingerprint', 1, 1,
         '2026-08-22T00:00:00Z'::timestamptz + make_interval(secs => value)
       from generate_series(1, 30) value
       on conflict do nothing`,
      [ids.actor],
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
  { name: "720px", width: 720, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  test(`${viewport.name} keeps Place history deep links usable`, async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize(viewport);
    await page.goto(`/campus-map/places/${ids.place}`);
    await page.getByRole("link", { name: /History/ }).click();

    await expect(
      page.getByRole("heading", { name: "历史测试饮水点的编辑记录" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "返回地图" })).toHaveAttribute(
      "href",
      "/campus-map?v=1",
    );
    await expect(page.getByText("地点已停用", { exact: true })).toBeVisible();
    await expect(page.getByText("来源摘要：现场复核")).toBeVisible();
    await expect(page.getByText(ids.retireRevision)).toHaveCount(0);
    await expect(page.getByText(ids.retireChangeset)).toHaveCount(0);
    await expect(page.getByText("查看 Changeset", { exact: true })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "复制稳定链接" }).click();
    await expect(page.getByText("链接已复制")).toBeVisible();

    const revisionLink = page
      .getByRole("link", { name: "查看修改详情" })
      .first();
    await revisionLink.focus();
    await expect(revisionLink).toBeFocused();
    await revisionLink.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/history/${ids.retireRevision}$`));
    await expect(page.getByText("地点已停用", { exact: true })).toBeVisible();
    await expect(page.getByText("来源摘要：现场复核")).toBeVisible();
    await expect(
      page.getByText(`Changeset：${ids.retireChangeset}`),
    ).toBeVisible();

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

  await page.goto(
    `/campus-map/places/${ids.place}/history?cursor=not-a-cursor`,
  );
  await expect(
    page.getByText("无法读取修订历史。请检查分页链接后重试。"),
  ).toBeVisible();
});

test("opens feed pagination from the keyboard", async ({ page }) => {
  await page.goto("/campus-map/changesets");
  const next = page.getByRole("link", { name: "下一页" });
  await next.focus();
  await expect(next).toBeFocused();
  await next.press("Enter");
  await expect(page).toHaveURL(/\/campus-map\/changesets\?cursor=/);
});

test("shows merged redirects and both permanent histories", async ({
  page,
}) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      `update campus_map_fact_revisions
       set status = 'merged', merged_into_place_id = $1
       where id = $2`,
      [ids.survivorPlace, ids.retireRevision],
    );
    await client.query("commit");

    await page.goto(`/campus-map/places/${ids.place}`);
    const survivor = page.getByRole("link", { name: "保留地点" });
    await expect(survivor).toBeVisible();
    await survivor.click();
    await expect(page).toHaveURL(
      new RegExp(`/campus-map/places/${ids.survivorPlace}$`),
    );
    await expect(page.getByRole("heading", { name: "保留地点" })).toBeVisible();
    await page.goto(`/campus-map/places/${ids.place}/history`);
    await expect(page.getByText("这个地点已合并。")).toBeVisible();
  } finally {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      `update campus_map_fact_revisions
       set status = 'retired', merged_into_place_id = null
       where id = $1`,
      [ids.retireRevision],
    );
    await client.query("commit");
    await client.end();
  }
});

test("renders redacted and partially visible changes as placeholders", async ({
  page,
}) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `update campus_map_revision_visibility
       set visibility = 'redacted', redaction_ref = 'e2e:#719'
       where revision_id = $1`,
      [ids.createRevision],
    );

    await page.goto(`/campus-map/changesets/${ids.createChangeset}`);
    await expect(page.getByText("内容已隐藏")).toBeVisible();
    await expect(page.getByText("历史测试饮水点")).toHaveCount(0);
    await expect(page.getByText(ids.createChange)).toHaveCount(0);
    await page.goto(`/campus-map/changesets/${ids.retireChangeset}`);
    await expect(page.getByText("内容已隐藏")).toBeVisible();
    await page.goto(
      `/campus-map/places/${ids.place}/history/${ids.retireRevision}`,
    );
    await expect(
      page.getByText("此修订仍公开，但较早修订已隐藏，因此不显示前后差异。"),
    ).toBeVisible();
  } finally {
    await client.query(
      `update campus_map_revision_visibility
       set visibility = 'public', redaction_ref = null
       where revision_id = $1`,
      [ids.createRevision],
    );
    await client.end();
  }
});

test("shows the safe database error boundary", async ({ page }) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "alter table campus_map_changesets rename to campus_map_changesets_unavailable",
    );
    await page.goto("/campus-map/changesets");
    await expect(
      page.getByRole("heading", {
        name: "暂时无法读取 Campus Map 历史",
      }),
    ).toBeVisible();
  } finally {
    await client.query(
      "alter table campus_map_changesets_unavailable rename to campus_map_changesets",
    );
    await client.end();
  }
});
