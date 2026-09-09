// refs #646, #649, #799, #838, #878, #880, #888, #889
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";
import {
  emitAmapEvent,
  installFakeCampusMapAmap,
  readAmapProjectedPoint,
} from "./helpers/campus-map-amap";

const browseIds = {
  building: "00000000-0000-4000-8000-000000006481",
  floor: "00000000-0000-4000-8000-000000006482",
  place: "00000000-0000-4000-8000-000000006483",
  changeset: "00000000-0000-4000-8000-000000006484",
  change: "00000000-0000-4000-8000-000000006485",
  revision: "00000000-0000-4000-8000-000000006486",
  actor: "00000000-0000-4000-8000-000000006487",
  provenance: "00000000-0000-4000-8000-000000006488",
} as const;
const eligibleEmail = "1155000648@link.cuhk.edu.hk";
const mappedBuildingProviderId = "qa-648-building";
const mappedPlaceProviderId = "qa-799-place";
const unmappedProviderId = "qa-799-transient";

const browseFactCleanup = [
  {
    statement: "delete from campus_map_current_facts where place_id = $1",
    id: browseIds.place,
  },
  {
    statement: "delete from campus_map_current_revisions where place_id = $1",
    id: browseIds.place,
  },
  {
    statement:
      "delete from campus_map_revision_visibility where revision_id = $1",
    id: browseIds.revision,
  },
  {
    statement: "delete from campus_map_fact_revisions where id = $1",
    id: browseIds.revision,
  },
  {
    statement: "delete from campus_map_place_changes where id = $1",
    id: browseIds.change,
  },
  {
    statement: "delete from campus_map_changesets where id = $1",
    id: browseIds.changeset,
  },
  {
    statement: "delete from campus_map_places where id = $1",
    id: browseIds.place,
  },
  {
    statement: "delete from campus_map_floors where id = $1",
    id: browseIds.floor,
  },
  {
    statement: "delete from campus_map_buildings where id = $1",
    id: browseIds.building,
  },
] as const;

async function cleanupBrowseFixtureData(client: Client) {
  const dynamicPlaces = await client.query<{ place_id: string }>(
    `select place_id from campus_map_current_facts
      where building_id = $1 and place_id <> $2`,
    [browseIds.building, browseIds.place],
  );
  const dynamicPlaceIds = dynamicPlaces.rows.map((row) => row.place_id);
  if (dynamicPlaceIds.length > 0) {
    const revisions = await client.query<{
      changeset_id: string;
      provenance_id: string | null;
    }>(
      `select distinct revision.changeset_id, provenance.provenance_id
         from campus_map_fact_revisions revision
         left join campus_map_revision_provenance provenance
           on provenance.revision_id = revision.id
        where revision.place_id = any($1::uuid[])`,
      [dynamicPlaceIds],
    );
    const changesetIds = [
      ...new Set(revisions.rows.map((row) => row.changeset_id)),
    ];
    const provenanceIds = [
      ...new Set(
        revisions.rows.flatMap((row) =>
          row.provenance_id ? [row.provenance_id] : [],
        ),
      ),
    ];
    await client.query(
      "delete from campus_map_publish_requests where changeset_id = any($1::uuid[])",
      [changesetIds],
    );
    await client.query(
      "delete from campus_map_current_facts where place_id = any($1::uuid[])",
      [dynamicPlaceIds],
    );
    await client.query(
      "delete from campus_map_current_revisions where place_id = any($1::uuid[])",
      [dynamicPlaceIds],
    );
    await client.query(
      `delete from campus_map_revision_photos
        where revision_id in (
          select id from campus_map_fact_revisions
           where place_id = any($1::uuid[])
        )`,
      [dynamicPlaceIds],
    );
    await client.query(
      `delete from campus_map_revision_visibility
        where revision_id in (
          select id from campus_map_fact_revisions
           where place_id = any($1::uuid[])
        )`,
      [dynamicPlaceIds],
    );
    await client.query(
      `delete from campus_map_revision_provenance
        where revision_id in (
          select id from campus_map_fact_revisions
           where place_id = any($1::uuid[])
        )`,
      [dynamicPlaceIds],
    );
    await client.query(
      "delete from campus_map_fact_revisions where place_id = any($1::uuid[])",
      [dynamicPlaceIds],
    );
    await client.query(
      "delete from campus_map_place_changes where place_id = any($1::uuid[])",
      [dynamicPlaceIds],
    );
    await client.query(
      "delete from campus_map_changesets where id = any($1::uuid[])",
      [changesetIds],
    );
    await client.query(
      "delete from campus_map_places where id = any($1::uuid[])",
      [dynamicPlaceIds],
    );
    if (provenanceIds.length > 0) {
      await client.query(
        "delete from campus_map_provenance_sources where id = any($1::uuid[])",
        [provenanceIds],
      );
    }
  }
  await client.query(
    "delete from campus_map_provider_mappings where provider = 'amap' and provider_object_id = any($1::text[])",
    [[mappedBuildingProviderId, mappedPlaceProviderId]],
  );
  for (const cleanup of browseFactCleanup) {
    await client.query(cleanup.statement, [cleanup.id]);
  }
  await client.query(
    "delete from campus_map_provenance_sources where id = $1",
    [browseIds.provenance],
  );
  await client.query(
    "update users set email = 'user@test.com' where email = $1",
    [eligibleEmail],
  );
}

async function applyBrowseFixtureData(client: Client) {
  await client.query(
    "update users set email = $1 where email = 'user@test.com'",
    [eligibleEmail],
  );
  await client.query(
    `insert into campus_map_buildings
       (id, name, english_name, code, aliases, anchor_longitude, anchor_latitude, anchor_crs)
     values ($1, '正式测试楼', 'Canonical Test Building', 'QA648-LONG',
       array['测试楼'], 114.2072, 22.4191, 'wgs84') on conflict do nothing`,
    [browseIds.building],
  );
  await client.query(
    `insert into campus_map_floors (id, building_id, display_label, sort_order)
     values ($1, $2, 'G/F', 0) on conflict do nothing`,
    [browseIds.floor, browseIds.building],
  );
  await client.query(
    `insert into campus_map_provenance_sources
       (id, source_kind, source_ref, accessed_on, rights_status)
     values ($1, 'provider-candidate', 'test:issue-799-runtime',
       '2026-08-28', 'restricted') on conflict do nothing`,
    [browseIds.provenance],
  );
  await client.query(
    "insert into campus_map_places (id) values ($1) on conflict do nothing",
    [browseIds.place],
  );
  await client.query(
    `insert into campus_map_changesets
       (id, actor_id_snapshot, actor_nickname_snapshot, comment, source_summary,
        client_name, client_version, affected_count, created_count, published_at)
     values ($1, $2, 'E2E 地图贡献者', '建立正式 runtime fixture', 'E2E fixture',
       'e2e', '1', 1, 1, '2026-08-28T00:00:00Z') on conflict do nothing`,
    [browseIds.changeset, browseIds.actor],
  );
  await client.query(
    `insert into campus_map_place_changes (id, changeset_id, place_id, operation, field_diff)
     values ($1, $2, $3, 'create', '{}') on conflict do nothing`,
    [browseIds.change, browseIds.changeset, browseIds.place],
  );
  await client.query(
    `insert into campus_map_fact_revisions
       (id, place_id, changeset_id, place_change_id, fact_schema_version,
        field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
        name, building_id, floor_id, pin_type, gender, wheelchair_access,
        temporary_status, location_kind, created_at)
     values ($1, $2, $3, $4, 2, '{}', 'active', $5, 'E2E 地图贡献者',
       '正式测试饮水点', $6, $7, 'water', null, null, null, 'floor',
       '2026-08-28T00:00:00Z')
     on conflict do nothing`,
    [
      browseIds.revision,
      browseIds.place,
      browseIds.changeset,
      browseIds.change,
      browseIds.actor,
      browseIds.building,
      browseIds.floor,
    ],
  );
  await client.query(
    "insert into campus_map_revision_visibility (revision_id) values ($1) on conflict do nothing",
    [browseIds.revision],
  );
  await client.query(
    `insert into campus_map_current_revisions (place_id, revision_id, status)
     values ($1, $2, 'active') on conflict do nothing`,
    [browseIds.place, browseIds.revision],
  );
  await client.query(
    `insert into campus_map_current_facts
       (place_id, revision_id, fact_schema_version, name, building_id, floor_id,
        pin_type, gender, wheelchair_access, temporary_status, location_kind,
        published_at)
     values ($1, $2, 2, '正式测试饮水点', $3, $4, 'water', null, null, null, 'floor',
       '2026-08-28T00:00:00Z') on conflict do nothing`,
    [browseIds.place, browseIds.revision, browseIds.building, browseIds.floor],
  );
  await client.query(
    `insert into campus_map_provider_mappings
       (provider, provider_object_id, target_kind, building_id, place_id, provenance_id)
     values
       ('amap', $1, 'building', $2, null, $4),
       ('amap', $3, 'place', null, $5, $4)
     on conflict (provider, provider_object_id) do nothing`,
    [
      mappedBuildingProviderId,
      browseIds.building,
      mappedPlaceProviderId,
      browseIds.provenance,
      browseIds.place,
    ],
  );
}

async function writeBrowseFixtureData(
  client: Client,
  action: "apply" | "cleanup",
) {
  await client.query("begin");
  try {
    await client.query("set local session_replication_role = replica");
    if (action === "apply") {
      await applyBrowseFixtureData(client);
    } else {
      await cleanupBrowseFixtureData(client);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function withBrowseFixture(action: "apply" | "cleanup") {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await writeBrowseFixtureData(client, action);
  } finally {
    await client.end();
  }
}

async function readPublishedBuildingId(placeId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ building_id: string | null }>(
      "select building_id from campus_map_current_facts where place_id = $1",
      [placeId],
    );
    return result.rows[0]?.building_id ?? null;
  } finally {
    await client.end();
  }
}

test.beforeAll(() => withBrowseFixture("apply"));
test.afterAll(() => withBrowseFixture("cleanup"));

test.beforeEach(async ({ page }) => {
  await installFakeCampusMapAmap(page);
  await loginWithPassword(page, eligibleEmail, "password123");
});

test("Campus Map and its AMap config require authentication", async ({
  browser,
  page,
}) => {
  const anonymous = await browser.newPage();
  const configResponse = await anonymous.request.get("/api/campus-map/config");
  expect(configResponse.status()).toBe(401);

  await anonymous.goto("/campus-map?v=1&task=create&anchor=map");
  await expect(anonymous).toHaveURL(/\/login\?/);
  const callbackUrl = new URL(anonymous.url()).searchParams.get("callbackUrl");
  expect(callbackUrl).toBe("/campus-map?v=1&task=create&anchor=map");
  await anonymous.close();

  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();
  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeVisible();
  await page.getByPlaceholder("搜索建筑名称").fill("正式测试楼");
  await page.locator(`[data-search-result="${browseIds.building}"]`).click();
  await page.getByRole("combobox", { name: "设施类型" }).selectOption("toilet");
  const draftUrl = page.url();

  await page.context().clearCookies();
  await page
    .getByRole("button", {
      name: "发布设施",
    })
    .click();
  await expect(
    page.getByText("登录后会回到这份草稿，但不会自动发布。"),
  ).toBeVisible();
  await page.getByRole("link", { name: "前往登录" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByLabel("CUHK 邮箱").fill(eligibleEmail);
  await page.getByLabel("密码").fill("password123");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "设施类型" })).toHaveValue(
    "toilet",
  );
  await expect(
    page.getByRole("button", {
      name: "发布设施",
    }),
  ).toBeEnabled();
  await expect(page.getByText("地点资料已发布")).toHaveCount(0);
});

test("search and marker open one canonical Place card", async ({ page }) => {
  await page.goto("/campus-map");
  const search = page.locator('input[placeholder="搜索建筑或地点…"]:visible');
  await search.fill("正式测试饮水点");
  await page
    .getByRole("button", { name: /正式测试饮水点.*正式测试楼/ })
    .click();

  const canonicalUrl = new RegExp(
    `/campus-map\\?v=1&scene=place&id=${browseIds.place}&snap=peek$`,
  );
  await expect(page).toHaveURL(canonicalUrl);
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();
  const currentPlaceMarker = page.locator(
    `[data-canonical-marker-key="building:${browseIds.building}:water"]`,
  );
  await expect(currentPlaceMarker).toBeVisible();
  await expect(currentPlaceMarker).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "正式测试饮水点" }),
  ).toContainText("饮水点");
  await expect(page.getByText(/Current fact/i)).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/scene=search/);
  await expect(
    page.getByRole("button", { name: /正式测试饮水点.*正式测试楼/ }),
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(canonicalUrl);
  await page.reload();
  await expect(page).toHaveURL(canonicalUrl);
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "详情与记录" })).toHaveAttribute(
    "href",
    `/campus-map/places/${browseIds.place}`,
  );

  await expect(
    page.getByRole("button", { name: "返回", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "关闭地点详情" }).click();
  await page.getByRole("button", { name: "饮水点" }).click();
  await page
    .locator(
      '[data-cupedia-marker="true"][aria-label*="正式测试楼有 1 个饮水点"]',
    )
    .click();
  await expect(page).toHaveURL(canonicalUrl);
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();
});

test("mobile Place details return to the same search list and history position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        const style = document.createElement("style");
        style.textContent =
          '[data-campus-map-results="search"] { max-height: 60px !important; }';
        document.head.append(style);
      },
      { once: true },
    );
  });
  await page.goto("/campus-map");
  const search = page.locator('input[placeholder="搜索建筑或地点…"]:visible');
  await search.fill("正式");
  const result = page.getByRole("button", { name: /正式测试饮水点/ });
  await expect(result).toBeVisible();
  const resultList = page.locator('[data-campus-map-results="search"]:visible');
  const expectedScrollTop = await resultList.evaluate((element) => {
    element.scrollTop = 48;
    return element.scrollTop;
  });
  expect(expectedScrollTop).toBeGreaterThan(0);
  const returnTo = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
  const returnUrl = new URL(returnTo, page.url()).toString();

  await result.evaluate((element) => (element as HTMLButtonElement).click());
  const details = page.getByRole("link", { name: "详情与记录" });
  await expect(details).toHaveAttribute(
    "href",
    `/campus-map/places/${browseIds.place}?from=${encodeURIComponent(returnTo)}`,
  );
  await details.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/campus-map/places/${browseIds.place}\\?from=`),
  );

  const returnLink = page.getByRole("link", { name: "返回地图" });
  await returnLink.focus();
  await returnLink.press("Enter");
  await expect(page).toHaveURL(returnUrl);
  await expect(search).toHaveValue("正式");
  await expect
    .poll(() => resultList.evaluate((element) => element.scrollTop))
    .toBe(expectedScrollTop);

  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/campus-map/places/${browseIds.place}\\?from=`),
  );
  await page.goBack();
  await expect(page).toHaveURL(returnUrl);
  await expect(search).toHaveValue("正式");
  await page.goForward();
  await expect(page).toHaveURL(
    new RegExp(`/campus-map/places/${browseIds.place}\\?from=`),
  );
  await page.goForward();
  await expect(page).toHaveURL(returnUrl);
});

test("mobile category, building card, and selected target stay reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");
  const classroom = page.getByRole("button", { name: "课室", exact: true });
  await classroom.focus();
  await classroom.press("Enter");
  await expect(classroom).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  const filters = page.getByRole("navigation", { name: "设施筛选" });
  await expect(filters).toBeInViewport();
  await expect(classroom).toBeInViewport({ ratio: 0.99 });
  await expect(page.getByRole("button", { name: "展开地点卡片" })).toHaveCount(
    0,
  );
  const closeCategory = page.getByRole("button", { name: "关闭课室列表" });
  await closeCategory.focus();
  await closeCategory.press("Enter");
  await expect(page.getByRole("heading", { name: "课室" })).toHaveCount(0);

  await page.goto(
    `/campus-map?v=1&scene=building&id=${browseIds.building}&snap=peek`,
  );
  await expect(page.getByRole("button", { name: "展开地点卡片" })).toHaveCount(
    0,
  );
  await expect(
    page.locator(`[data-return-result="${browseIds.place}"]:visible`),
  ).toBeVisible();
  const panel = page.getByRole("region", { name: "正式测试楼" });
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  await expect
    .poll(async () => {
      const point = await readAmapProjectedPoint(page, [114.2072, 22.4191]);
      return point[1];
    })
    .toBeLessThan(panelBox!.y);
});

test("Building opens Place directly and Back restores the Building card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const buildingUrl = `/campus-map?v=1&scene=building&id=${browseIds.building}&snap=peek`;
  const placeUrl = new RegExp(
    `/campus-map\\?v=1&scene=place&id=${browseIds.place}&snap=peek$`,
  );

  await page.goto(buildingUrl);
  await expect(page.getByRole("heading", { name: "正式测试楼" })).toBeVisible();
  const buildingCard = page.getByRole("region", { name: "正式测试楼" }).first();
  await expect(buildingCard.getByText("Canonical Test Building")).toBeVisible();
  const buildingResult = buildingCard.locator(
    `[data-return-result="${browseIds.place}"]`,
  );
  await expect(buildingResult).toContainText("饮水点");
  await buildingResult.click();
  await expect(page).toHaveURL(placeUrl);
  await page.goBack();
  await expect(page).toHaveURL(buildingUrl);
  await expect(page.getByRole("heading", { name: "正式测试楼" })).toBeVisible();
  await expect(buildingResult).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(placeUrl);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(buildingUrl);
  const desktopBuildingResult = page.locator(
    `[data-return-result="${browseIds.place}"]:visible`,
  );
  await desktopBuildingResult.click();
  await expect(page).toHaveURL(placeUrl);
  await page.goBack();
  await expect(page).toHaveURL(buildingUrl);
  await expect(desktopBuildingResult).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(placeUrl);

  await page.goto("/campus-map");
  await page.getByRole("button", { name: "饮水点" }).click();
  await expect(page).toHaveURL(/scene=category&id=water&snap=peek$/);
  await expect(
    page.getByRole("button", { name: "查看全部 1 处设施" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /正式测试饮水点/ }).click();
  await expect(page).toHaveURL(placeUrl);
  await page.goBack();
  await expect(page).toHaveURL(/scene=category&id=water&snap=peek$/);
  await page.goForward();
  await expect(page).toHaveURL(placeUrl);

  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();
  await expect(page).toHaveURL(/task=create&anchor=map$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "新增设施" })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/campus-map\?v=1$/);
  await expect(page.getByRole("heading", { name: "新增设施" })).toHaveCount(0);

  await page.goto("/campus-map?v=1&scene=place&id=missing-place&snap=peek");
  await expect(page).toHaveURL(/\/campus-map\?v=1$/);
  await expect(
    page.locator("[aria-labelledby='campus-map-panel-title']").first(),
  ).toBeHidden();
});

test("long-press and right-click leave contribution to the explicit Add action", async ({
  page,
}) => {
  for (const scenario of [
    {
      event: "longpress",
      viewport: { width: 390, height: 844 },
      position: { lng: 114.2051, lat: 22.4189 },
    },
    {
      event: "rightclick",
      viewport: { width: 1280, height: 800 },
      position: { lng: 114.2093, lat: 22.4221 },
    },
  ]) {
    await page.setViewportSize(scenario.viewport);
    await page.goto("/campus-map");
    await emitAmapEvent(page, scenario.event, {
      lnglat: scenario.position,
    });
    await emitAmapEvent(page, "click", {
      lnglat: scenario.position,
    });

    await expect(page.getByRole("heading", { name: "新增设施" })).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/\/campus-map\?v=1$/);

    await page.getByRole("button", { name: "新增设施" }).click();
    await expect(
      page.getByRole("heading", { name: "设施在哪里？" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/task=create/);

    await page.evaluate(() => window.sessionStorage.clear());
  }
});

test("one mapped AMap hotspot opens once and a map click closes it", async ({
  page,
}) => {
  await page.goto("/campus-map");
  const historyBefore = await page.evaluate(() => window.history.length);

  await emitAmapEvent(page, "hotspotclick", {
    id: mappedBuildingProviderId,
    name: "高德正式测试楼",
    lnglat: { lng: 114.2072, lat: 22.4191 },
  });

  await expect(page).toHaveURL(
    new RegExp(
      `/campus-map\\?v=1&scene=building&id=${browseIds.building}&snap=peek$`,
    ),
  );
  await expect(page.getByRole("heading", { name: "正式测试楼" })).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(
    historyBefore + 1,
  );
  await emitAmapEvent(page, "click", {
    lnglat: { lng: 114.2073, lat: 22.4192 },
  });
  await expect(page).toHaveURL(/\/campus-map\?v=1$/);
  await expect(page.getByRole("heading", { name: "正式测试楼" })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => window.history.length)).toBe(
    historyBefore + 1,
  );
});

test("a mapped AMap Building starts Add with its canonical Building selected", async ({
  page,
}) => {
  await page.goto("/campus-map");

  await emitAmapEvent(page, "hotspotclick", {
    id: mappedBuildingProviderId,
    name: "高德正式测试楼",
    lnglat: { lng: 114.2072, lat: 22.4191 },
  });

  await expect(page.getByRole("heading", { name: "正式测试楼" })).toBeVisible();
  await page.getByRole("button", { name: "在正式测试楼新增设施" }).click();

  await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "正式测试楼",
  );
  await expect(page.getByRole("combobox", { name: "建筑" })).toHaveCount(0);
});

test("global Add selects the mapped AMap Building hotspot on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();
  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeVisible();
  await expect(page.locator("[data-campus-map-building-picker]")).toHaveCount(
    0,
  );

  await emitAmapEvent(page, "hotspotclick", {
    id: mappedBuildingProviderId,
    name: "高德正式测试楼",
    lnglat: { lng: 114.2072, lat: 22.4191 },
  });

  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "正式测试楼",
  );
  await expect(
    page.locator("[data-campus-map-provider-building-selection]"),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "正式测试楼",
  );
});

test("mapped and unmapped AMap hotspots keep canonical and transient cards separate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");

  await emitAmapEvent(page, "hotspotclick", {
    id: mappedPlaceProviderId,
    name: "高德测试饮水点",
    lnglat: { lng: 114.2072, lat: 22.4191 },
  });

  await expect(page).toHaveURL(
    new RegExp(
      `/campus-map\\?v=1&scene=place&id=${browseIds.place}&snap=peek$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();
  await expect(page.getByText("高德地图地点")).toHaveCount(0);

  await emitAmapEvent(page, "hotspotclick", {
    id: unmappedProviderId,
    name: "未映射高德参考点",
    lnglat: { lng: 114.2074, lat: 22.4193 },
  });

  await expect(page).toHaveURL(/\/campus-map\?v=1$/);
  await expect(page.getByText("高德地图地点")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "高德测试饮水点" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "未映射高德参考点" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "新增设施" })).toBeVisible();
  await page.getByRole("button", { name: "饮水点", pressed: false }).click();
  await expect(page).toHaveURL(/scene=category&id=water&snap=peek$/);
  await expect(page.getByRole("heading", { name: "饮水点" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /正式测试饮水点.*正式测试楼/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "未映射高德参考点" }),
  ).toHaveCount(0);
});

test("the transient provider action stays inside the card on a short mobile viewport", async ({
  page,
}) => {
  const providerName = "未映射高德参考点（科学馆东座临时入口）";
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/campus-map");

  await emitAmapEvent(page, "hotspotclick", {
    id: unmappedProviderId,
    name: providerName,
    lnglat: { lng: 114.2074, lat: 22.4193 },
  });

  const card = page.getByRole("region", { name: providerName });
  const action = card.getByRole("button", {
    name: "新增设施",
  });
  await expect(card).toBeVisible();
  await expect(action).toBeVisible();
  const cardBox = await card.boundingBox();
  const actionBox = await action.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y).toBeGreaterThanOrEqual(cardBox!.y);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
    cardBox!.y + cardBox!.height,
  );
  await action.click();
  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "发布设施",
    }),
  ).toHaveCount(0);
});

test("publish handoff shows one success prompt and never restores the form", async ({
  page,
}) => {
  const publishedName = "公共空间";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();
  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeVisible();
  await page.getByPlaceholder("搜索建筑名称").fill("正式测试楼");
  await page.locator(`[data-search-result="${browseIds.building}"]`).click();
  await page
    .getByRole("combobox", { name: "设施类型" })
    .selectOption("common-space");
  await page
    .getByRole("button", {
      name: "发布设施",
    })
    .click();

  await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
  const publishedUrl = new URL(page.url());
  const placeId = publishedUrl.searchParams.get("id");
  expect(placeId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: publishedName }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "已添加到 正式测试楼 · 建筑内",
  );
  await expect(page.getByText("PUBLISHED")).toHaveCount(0);
  const publishNoticeBox = await page.getByRole("status").boundingBox();
  const publishedCardBox = await page
    .getByRole("region", { name: publishedName })
    .boundingBox();
  const searchBox = await page
    .getByRole("textbox", {
      name: "搜索建筑或地点",
    })
    .boundingBox();
  expect(publishNoticeBox).not.toBeNull();
  expect(publishedCardBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(publishNoticeBox!.y + publishNoticeBox!.height).toBeLessThanOrEqual(
    publishedCardBox!.y,
  );
  expect(
    publishNoticeBox!.x + publishNoticeBox!.width <= searchBox!.x ||
      searchBox!.x + searchBox!.width <= publishNoticeBox!.x ||
      publishNoticeBox!.y + publishNoticeBox!.height <= searchBox!.y ||
      searchBox!.y + searchBox!.height <= publishNoticeBox!.y,
  ).toBe(true);

  await page.goBack();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "新增设施" })).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(publishedUrl.toString());
  await expect(
    page.getByRole("heading", { name: publishedName }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: publishedName }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);

  await page
    .locator('input[placeholder="搜索建筑或地点…"]:visible')
    .first()
    .fill(publishedName);
  const publishedResult = page.locator(`[data-search-result="${placeId}"]`);
  await expect(publishedResult).toBeVisible();
  await publishedResult.click();
  await expect(
    page.getByRole("heading", { name: publishedName }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/campus-map\\?v=1&scene=place&id=${placeId}&snap=peek$`),
  );

  await page.goto("/campus-map");
  const buildingSearch = page.locator(
    'input[placeholder="搜索建筑或地点…"]:visible',
  );
  await buildingSearch.fill("正式测试楼");
  await page.locator(`[data-search-result="${browseIds.building}"]`).click();
  await expect(page.getByRole("heading", { name: "正式测试楼" })).toBeVisible();
  const publishedBuildingResult = page.locator(
    `[data-return-result="${placeId}"]`,
  );
  await expect(publishedBuildingResult).toContainText(publishedName);
  await publishedBuildingResult.click();
  await expect(page).toHaveURL(
    new RegExp(`/campus-map\\?v=1&scene=place&id=${placeId}&snap=peek$`),
  );
});

test("cards remain usable across short phones, tablets, and desktop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 390, height: 667 },
    { width: 390, height: 844 },
    { width: 720, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/campus-map");
    await expect(
      page.locator('header:has(input[placeholder="搜索建筑或地点…"])').first(),
    ).toHaveCSS("transition-property", "none");
    await page
      .locator('input[placeholder="搜索建筑或地点…"]:visible')
      .fill("正式");
    const clearSearch = page.locator('button[aria-label="清除搜索"]:visible');
    const clearSearchBox = await clearSearch.boundingBox();
    expect(clearSearchBox).not.toBeNull();
    expect(clearSearchBox!.width).toBeGreaterThanOrEqual(44);
    expect(clearSearchBox!.height).toBeGreaterThanOrEqual(44);

    await page.goto(
      `/campus-map?v=1&scene=building&id=${browseIds.building}&snap=peek`,
    );
    const card = page.getByRole("region", { name: "正式测试楼" });
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width >= 768) {
      expect(cardBox!.height).toBeLessThanOrEqual(520);
      const searchBox = await page
        .getByRole("textbox", { name: "搜索建筑或地点" })
        .boundingBox();
      const filterBox = await page
        .getByRole("navigation", { name: "设施筛选" })
        .boundingBox();
      expect(searchBox).not.toBeNull();
      expect(filterBox).not.toBeNull();
      expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(cardBox!.x);
      expect(filterBox!.x + filterBox!.width).toBeLessThanOrEqual(cardBox!.x);
    } else {
      expect(cardBox!.height).toBeLessThanOrEqual(356);
      await expect(card.getByRole("heading", { name: "G/F" })).toBeVisible();
      await expect(
        card.locator(`[data-return-result="${browseIds.place}"]`),
      ).toContainText("正式测试饮水点");
      await expect(
        card.getByRole("button", { name: "查看全部楼内设施" }),
      ).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: "展开地点卡片" }),
      ).toHaveCount(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);

    const attribution = page.locator(".amap-copyright");
    await expect(attribution).toBeVisible();
    if (viewport.width < 768) {
      const attributionBox = await attribution.boundingBox();
      expect(attributionBox).not.toBeNull();
      expect(attributionBox!.y + attributionBox!.height).toBeLessThanOrEqual(
        cardBox!.y,
      );
    }

    await expect(card.getByRole("heading", { name: "G/F" })).toBeVisible();
    const place = page.locator(
      `[data-return-result="${browseIds.place}"]:visible`,
    );
    await expect(place).toBeVisible();
    await place.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(
        `/campus-map\\?v=1&scene=place&id=${browseIds.place}&snap=peek$`,
      ),
    );
    await expect(
      page.getByRole("heading", { name: "正式测试饮水点" }),
    ).toBeFocused();
    const suggestEdit = page.getByRole("button", { name: "建议修改" });
    const placeDetails = page.getByRole("link", { name: "详情与记录" });
    await expect(suggestEdit).toBeVisible();
    await expect(page.getByRole("button", { name: "查看建筑" })).toHaveCount(0);
    await expect(placeDetails).toBeVisible();
    if (viewport.width < 768) {
      const placeCard = page.getByRole("region", {
        name: "正式测试饮水点",
      });
      const placeCardBox = await placeCard.boundingBox();
      expect(placeCardBox).not.toBeNull();
      expect(placeCardBox!.height).toBeLessThanOrEqual(196);
      await expect(
        placeCard.getByText(/饮水点 · 正式测试楼 · G\/F/),
      ).toBeVisible();
    }
    for (const action of [suggestEdit, placeDetails]) {
      const actionBox = await action.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
        viewport.height,
      );
    }
  }
});

test("global Add publishes the mapped AMap Building association", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();

  await emitAmapEvent(page, "hotspotclick", {
    id: mappedBuildingProviderId,
    name: "高德正式测试楼",
    lnglat: { lng: 114.2072, lat: 22.4191 },
  });
  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "正式测试楼",
  );
  await expect(
    page.locator("[data-campus-map-provider-building-selection]"),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "设施类型" })
    .selectOption("common-space");
  await page
    .getByRole("button", {
      name: "发布设施",
    })
    .click();

  await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
  const placeId = new URL(page.url()).searchParams.get("id");
  expect(placeId).not.toBeNull();
  await expect(page.getByRole("status")).toContainText(
    "已添加到 正式测试楼 · 建筑内",
  );
  await expect
    .poll(() => readPublishedBuildingId(placeId!))
    .toBe(browseIds.building);
});

test("the verified Cheng Ming hotspot opens its canonical building and builtin floors", async ({
  page,
}) => {
  await page.goto("/campus-map");
  await emitAmapEvent(page, "hotspotclick", {
    id: "B0FFF0ABIJ",
    name: "诚明馆",
    lnglat: { lng: 114.212826, lat: 22.418488 },
  });
  await expect(page).toHaveURL(
    /scene=building&id=631f84c4-9daa-5a40-bafc-886dbb59121a/,
  );
  await expect(page.getByText("高德地图地点")).toHaveCount(0);
  await page.getByRole("button", { name: /在诚明馆新增/ }).click();
  await expect(
    page.getByRole("combobox", { name: "楼层" }).getByRole("option"),
  ).toHaveText(["不确定", "地下（G）", "1 楼", "2 楼", "3 楼"]);
  await expect(
    page.getByRole("button", { name: "室外", exact: true }),
  ).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 568, height: 320 },
  { width: 1280, height: 800 },
]) {
  test(`empty building floors stay usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      "/campus-map?v=1&scene=building&id=41b66763-b2ae-5ede-989e-846e2153bdaa&snap=peek",
    );
    const card = page.getByRole("region", { name: "文物馆", exact: true });
    const floor = card.getByRole("combobox", { name: "切换楼层" });
    await expect(floor).toBeInViewport();
    await floor.selectOption({ label: "地下（G）" });
    const add = card.getByRole("button", { name: /在文物馆新增/ });
    await expect(add).toBeInViewport();
    const cardBox = await card.boundingBox();
    const addBox = await add.boundingBox();
    expect(addBox!.y + addBox!.height).toBeLessThanOrEqual(
      cardBox!.y + cardBox!.height,
    );
    await add.click();
    await expect(
      page.getByRole("combobox", { name: "楼层" }).locator("option:checked"),
    ).toHaveText("地下（G）");
  });
}

test("a selected empty floor never shows a facility from another floor", async ({
  page,
}) => {
  const floorId = "00000000-0000-4000-8000-000000006499";
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "insert into campus_map_floors (id,building_id,display_label,sort_order) values ($1,$2,'2/F',2)",
      [floorId, browseIds.building],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/campus-map?v=1&scene=building&id=${browseIds.building}&floor=${floorId}&snap=peek`,
    );
    const floor = page.getByRole("combobox", { name: "切换楼层" });
    await expect(floor).toHaveValue(floorId);
    await expect(floor.locator("option:checked")).toHaveText("2/F");
    await expect(
      page.locator(`[data-return-result="${browseIds.place}"]`),
    ).toHaveCount(0);
    await expect(page.getByText("这个楼层暂未收录设施")).toBeVisible();
  } finally {
    await client.query("delete from campus_map_floors where id=$1", [floorId]);
    await client.end();
  }
});
