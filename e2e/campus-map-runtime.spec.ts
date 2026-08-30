// refs #646, #649, #799
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import {
  commandCampusMapProviderMapping,
  type CampusMapProviderMappingTarget,
} from "@/lib/campus-map/provider-mapping-registry";
import { loginWithPassword } from "./helpers/auth";
import {
  emitAmapEvent,
  installFakeCampusMapAmap,
  readAmapProjectedPoint,
  readAmapSnapshot,
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

function visibleMapCanvas(page: Page) {
  return page.locator("#amap-campus-canvas:visible");
}

const providerMappingFixtures = [
  {
    identity: {
      provider: "amap",
      providerObjectId: mappedBuildingProviderId,
    },
    target: {
      kind: "building",
      buildingId: browseIds.building,
    } satisfies CampusMapProviderMappingTarget,
    bindKey: "00000000-0000-4000-8000-000000006491",
    unlinkKey: "00000000-0000-4000-8000-000000006493",
  },
  {
    identity: {
      provider: "amap",
      providerObjectId: mappedPlaceProviderId,
    },
    target: {
      kind: "place",
      placeId: browseIds.place,
    } satisfies CampusMapProviderMappingTarget,
    bindKey: "00000000-0000-4000-8000-000000006492",
    unlinkKey: "00000000-0000-4000-8000-000000006494",
  },
] as const;

async function commandProviderMappingFixtures(
  action: "bind" | "unlink",
  client: Client,
) {
  const actor = await client.query<{ id: string }>(
    "select id from users where email = 'admin@test.com' limit 1",
  );
  const actorId = actor.rows[0]?.id;
  if (!actorId) throw new Error("E2E provider mapping admin is missing");

  for (const fixture of providerMappingFixtures) {
    const result = await commandCampusMapProviderMapping(
      action === "bind"
        ? {
            kind: "bind",
            idempotencyKey: fixture.bindKey,
            identity: fixture.identity,
            target: fixture.target,
            reason: "Prepare the Campus Map runtime E2E fixture",
            provenanceId: browseIds.provenance,
          }
        : {
            kind: "unlink",
            idempotencyKey: fixture.unlinkKey,
            identity: fixture.identity,
            previousTarget: fixture.target,
            reason: "Clean up the Campus Map runtime E2E fixture",
            provenanceId: browseIds.provenance,
          },
      { actorId },
    );
    const acceptedOutcomes =
      action === "bind" ? ["bound", "unchanged"] : ["unlinked", "unchanged"];
    if (
      result.status !== "mapped" ||
      !acceptedOutcomes.includes(result.outcome)
    ) {
      throw new Error(
        `E2E provider mapping ${action} failed: ${JSON.stringify(result)}`,
      );
    }
  }
}

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
  await client.query(
    "delete from campus_map_provider_mapping_requests where idempotency_key = any($1::uuid[])",
    [
      providerMappingFixtures.flatMap((fixture) => [
        fixture.bindKey,
        fixture.unlinkKey,
      ]),
    ],
  );
  await client.query(
    "delete from campus_map_provider_mapping_events where provider = 'amap' and provider_object_id = any($1::text[])",
    [
      providerMappingFixtures.map(
        (fixture) => fixture.identity.providerObjectId,
      ),
    ],
  );
  for (const cleanup of browseFactCleanup) {
    await client.query(cleanup.statement, [cleanup.id]);
  }
  await client.query("delete from campus_map_fact_schemas where version = 648");
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
    `insert into campus_map_fact_schemas (version, status, definition, display_metadata)
     values (648, 'draft', '{"fields":{},"pinTypes":{}}', '{}')
     on conflict (version) do nothing`,
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
        name, building_id, floor_id, pin_type, location_kind, created_at)
     values ($1, $2, $3, $4, 648, '{}', 'active', $5, 'E2E 地图贡献者',
       '正式测试饮水点', $6, $7, 'water', 'floor', '2026-08-28T00:00:00Z')
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
        pin_type, location_kind, published_at)
     values ($1, $2, 648, '正式测试饮水点', $3, $4, 'water', 'floor',
       '2026-08-28T00:00:00Z') on conflict do nothing`,
    [browseIds.place, browseIds.revision, browseIds.building, browseIds.floor],
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
    if (action === "cleanup") {
      await commandProviderMappingFixtures("unlink", client);
    }
    await writeBrowseFixtureData(client, action);
    if (action === "apply") {
      await commandProviderMappingFixtures("bind", client);
    }
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
  await page.getByRole("button", { name: "使用此位置" }).click();
  await page
    .getByRole("group", { name: "设施类型" })
    .getByText("洗手间", { exact: true })
    .click();
  const draftUrl = page.url();

  await page.context().clearCookies();
  await page.getByRole("button", { name: "发布设施" }).click();
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
  await expect(page.getByRole("radio", { name: "洗手间" })).toBeChecked();
  await expect(page.getByRole("button", { name: "发布设施" })).toBeEnabled();
  await expect(page.getByText("地点资料已发布")).toHaveCount(0);
});

test("search and marker open one canonical Place card", async ({ page }) => {
  await page.goto("/campus-map");
  const search = page.getByPlaceholder("搜索建筑或地点…");
  await search.fill("正式测试饮水点");
  await page
    .getByRole("button", { name: /正式测试饮水点.*正式测试楼/ })
    .click();

  const canonicalUrl = new RegExp(
    `/campus-map\\?v=1&scene=facility&id=${browseIds.place}&snap=peek$`,
  );
  await expect(page).toHaveURL(canonicalUrl);
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();
  const currentPlaceMarker = page.locator(
    `[data-facility-id="building:${browseIds.building}:water"]`,
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
  await expect(
    page.getByRole("link", { name: "查看编辑记录" }),
  ).toHaveAttribute("href", `/campus-map/places/${browseIds.place}/history`);

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

test("Building expands into Place and Back restores the Building card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const buildingUrl = `/campus-map?v=1&scene=building&id=${browseIds.building}&snap=peek`;
  const placeUrl = new RegExp(
    `/campus-map\\?v=1&scene=facility&id=${browseIds.place}&snap=peek$`,
  );

  await page.goto(buildingUrl);
  await expect(page.getByRole("heading", { name: "正式测试楼" })).toBeVisible();
  const buildingCard = page.getByRole("region", { name: "正式测试楼" }).first();
  await expect(buildingCard.getByText("Canonical Test Building")).toBeVisible();
  const facilitySummary = buildingCard.getByRole("list", {
    name: "楼内设施",
  });
  await expect(facilitySummary).toContainText("饮水点");
  await expect(facilitySummary).toContainText("1 处");
  const buildingPreview = buildingCard.locator(
    `[data-building-preview="${browseIds.place}"]`,
  );
  await buildingPreview.click();
  await expect(page).toHaveURL(placeUrl);
  await page.goBack();
  await expect(page).toHaveURL(buildingUrl);
  await expect(page.getByRole("heading", { name: "正式测试楼" })).toBeVisible();
  await expect(buildingPreview).toBeFocused();
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
  await expect(page.getByRole("heading", { name: "选择设施位置" })).toHaveCount(
    0,
  );
  await page.goForward();
  await expect(page).toHaveURL(/\/campus-map\?v=1$/);
  await expect(page.getByRole("heading", { name: "选择设施位置" })).toHaveCount(
    0,
  );

  await page.goto("/campus-map?v=1&scene=facility&id=missing-place&snap=peek");
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

    await expect(
      page.getByRole("heading", { name: "选择设施位置" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/campus-map\?v=1$/);

    await page.getByRole("button", { name: "新增设施" }).click();
    await expect(
      page.getByRole("heading", { name: "选择设施位置" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/task=create/);

    await page.evaluate(() => window.sessionStorage.clear());
  }
});

test("one provider callback produces one canonical effect and a map gesture closes it", async ({
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
  await expect(page.getByText("高德地图地点")).toHaveCount(0);

  await expect(visibleMapCanvas(page)).toHaveCount(1);
  await visibleMapCanvas(page).dispatchEvent("pointerdown");
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

test("mapped and unmapped provider POIs never duplicate cards", async ({
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
      `/campus-map\\?v=1&scene=facility&id=${browseIds.place}&snap=peek$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();
  await expect(page.getByText("高德地图地点")).toHaveCount(0);

  await page.getByRole("button", { name: "返回地图" }).click();
  await expect(page).toHaveURL(/\/campus-map\?v=1$/);
  await expect(visibleMapCanvas(page)).toBeFocused();
  const historyBeforeTransient = await page.evaluate(
    () => window.history.length,
  );

  await visibleMapCanvas(page).dispatchEvent("pointerdown");
  await emitAmapEvent(page, "hotspotclick", {
    id: unmappedProviderId,
    name: "未映射高德参考点",
    lnglat: { lng: 114.2074, lat: 22.4193 },
  });

  await expect(page).toHaveURL(/\/campus-map\?v=1$/);
  await expect(page.getByText("高德地图地点")).toBeVisible();
  const providerCard = page.getByRole("region", {
    name: "未映射高德参考点",
  });
  const providerHeading = providerCard.getByRole("heading", {
    name: "未映射高德参考点",
  });
  await expect(providerCard).toBeVisible();
  await expect(providerHeading).toBeFocused();
  const providerCardBox = await providerCard.boundingBox();
  expect(providerCardBox).not.toBeNull();
  expect(providerCardBox!.height).toBeLessThanOrEqual(120);
  await expect(page.getByRole("button", { name: "建议修改" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "查看编辑记录" })).toHaveCount(0);
  expect(await page.evaluate(() => window.history.length)).toBe(
    historyBeforeTransient,
  );
  await page.keyboard.press("Escape");
  await expect(providerCard).toHaveCount(0);
});

test("a rapid newer Place intent wins over a delayed provider result", async ({
  page,
}) => {
  let delayedProviderRequest = false;
  await page.route("**/campus-map**", async (route) => {
    if (route.request().method() === "POST" && !delayedProviderRequest) {
      delayedProviderRequest = true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });
  await page.goto("/campus-map");

  const providerResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/campus-map",
  );
  await emitAmapEvent(page, "hotspotclick", {
    id: mappedBuildingProviderId,
    name: "高德正式测试楼",
    lnglat: { lng: 114.2072, lat: 22.4191 },
  });
  await page.getByPlaceholder("搜索建筑或地点…").fill("正式测试饮水点");
  await page
    .getByRole("button", { name: /正式测试饮水点.*正式测试楼/ })
    .click();

  const placeUrl = new RegExp(
    `/campus-map\\?v=1&scene=facility&id=${browseIds.place}&snap=peek$`,
  );
  await expect(page).toHaveURL(placeUrl);
  await providerResponse;
  await expect(page).toHaveURL(placeUrl);
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();
  const currentPlaceMarker = page.locator(
    `[data-facility-id="building:${browseIds.building}:water"]`,
  );
  await expect(currentPlaceMarker).toBeVisible();
  await expect(currentPlaceMarker).toHaveAttribute("aria-pressed", "true");
});

test("three peek/full rounds and ResizeObserver callbacks do not accumulate camera drift", async ({
  page,
}) => {
  const targetPosition = [114.2072, 22.4191] as const;
  await page.setViewportSize({ width: 720, height: 844 });
  await page.goto(
    `/campus-map?v=1&scene=building&id=${browseIds.building}&snap=peek`,
  );
  const initial = await readAmapSnapshot(page);
  const fullSnapshots: Array<{
    center: readonly [number, number];
    targetPixel: readonly [number, number];
  }> = [];

  for (let round = 0; round < 3; round += 1) {
    await page.getByRole("button", { name: "展开地点卡片" }).click();
    await expect(
      page.getByRole("button", { name: "收起地点卡片" }),
    ).toBeVisible();
    const full = await readAmapSnapshot(page);
    expect(full.panToCount).toBeLessThanOrEqual(initial.panToCount + round + 1);
    fullSnapshots.push({
      center: full.center,
      targetPixel: await readAmapProjectedPoint(page, targetPosition),
    });
    expect(full.zoom).toBe(initial.zoom);

    await page.getByRole("button", { name: "收起地点卡片" }).click();
    await expect(
      page.getByRole("button", { name: "展开地点卡片" }),
    ).toBeVisible();
  }

  for (const snapshot of fullSnapshots.slice(1)) {
    expect(snapshot.center[0]).toBeCloseTo(fullSnapshots[0].center[0], 10);
    expect(snapshot.center[1]).toBeCloseTo(fullSnapshots[0].center[1], 10);
    expect(snapshot.targetPixel[0]).toBeCloseTo(
      fullSnapshots[0].targetPixel[0],
      5,
    );
    expect(snapshot.targetPixel[1]).toBeCloseTo(
      fullSnapshots[0].targetPixel[1],
      5,
    );
  }
  const beforeResize = await readAmapSnapshot(page);
  const targetBeforeResize = await readAmapProjectedPoint(page, targetPosition);
  await page.setViewportSize({ width: 720, height: 845 });
  await page.setViewportSize({ width: 720, height: 844 });
  await expect(visibleMapCanvas(page)).toHaveCSS("height", "844px");
  const afterResize = await readAmapSnapshot(page);
  const targetAfterResize = await readAmapProjectedPoint(page, targetPosition);
  expect(afterResize.zoom).toBe(beforeResize.zoom);
  expect(afterResize.center[0]).toBeCloseTo(beforeResize.center[0], 10);
  expect(afterResize.center[1]).toBeCloseTo(beforeResize.center[1], 10);
  expect(targetAfterResize[0]).toBeCloseTo(targetBeforeResize[0], 5);
  expect(targetAfterResize[1]).toBeCloseTo(targetBeforeResize[1], 5);
});

test("publish handoff shows one success prompt and never restores the form", async ({
  page,
}) => {
  const publishedName = "打印站";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();
  await page.getByRole("button", { name: "使用此位置" }).click();
  await page
    .getByRole("group", { name: "设施类型" })
    .getByText("打印服务", { exact: true })
    .click();
  await page.getByRole("button", { name: "发布设施" }).click();

  await expect(page).toHaveURL(/scene=facility&id=[0-9a-f-]+&snap=peek$/);
  const publishedUrl = new URL(page.url());
  const placeId = publishedUrl.searchParams.get("id");
  expect(placeId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: publishedName }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("地点已发布");
  const selectedMarker = page.locator(`[data-facility-id="place:${placeId}"]`);
  await expect(selectedMarker).toBeVisible();
  await expect(selectedMarker).toHaveAttribute("aria-pressed", "true");
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
  await expect(page.getByRole("heading", { name: "选择设施位置" })).toHaveCount(
    0,
  );

  await page.goForward();
  await expect(page).toHaveURL(publishedUrl.toString());
  await expect(selectedMarker).toBeVisible();
  await expect(selectedMarker).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: publishedName }),
  ).toBeVisible();
  await expect(selectedMarker).toBeVisible();
  await expect(selectedMarker).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toHaveCount(0);

  await page
    .locator('input[placeholder="搜索建筑或地点…"]:visible')
    .first()
    .fill(publishedName);
  const publishedResult = page.locator(`[data-search-result="${placeId}"]`);
  await expect(publishedResult).toBeVisible();
  await publishedResult.click();
  await expect(page).toHaveURL(
    new RegExp(`/campus-map\\?v=1&scene=facility&id=${placeId}&snap=peek$`),
  );
});

test("cards remain usable at 390x844, 720x844, and 1280x800", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
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
    const facilitySummary = card.getByRole("list", { name: "楼内设施" });
    await expect(facilitySummary).toContainText("饮水点");
    await expect(facilitySummary).toContainText("1 处");
    const buildingCode = card.getByText("QA648-LONG", { exact: true });
    await expect(buildingCode).toBeVisible();
    const buildingCodeBox = await buildingCode.boundingBox();
    expect(buildingCodeBox).not.toBeNull();
    expect(buildingCodeBox!.height).toBeLessThan(32);
    expect(
      await buildingCode.evaluate(
        (element) => element.scrollHeight <= element.clientHeight,
      ),
    ).toBe(true);

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
      expect(cardBox!.height).toBeLessThanOrEqual(316);
      const buildingPreview = card.locator("[data-building-preview]");
      await expect(buildingPreview).toContainText("正式测试饮水点");
      const buildingCta = card.getByRole("button", {
        name: "查看全部楼内设施",
      });
      await expect(buildingCta).toBeVisible();
      const buildingCtaBox = await buildingCta.boundingBox();
      expect(buildingCtaBox).not.toBeNull();
      expect(buildingCtaBox!.y + buildingCtaBox!.height).toBeLessThanOrEqual(
        cardBox!.y + cardBox!.height,
      );
      await expect(card.getByRole("heading", { name: "G/F" })).toHaveCount(0);
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

    if (viewport.width < 768) {
      await page.getByRole("button", { name: "展开地点卡片" }).click();
      const fullCardBox = await card.boundingBox();
      expect(fullCardBox).not.toBeNull();
      expect(fullCardBox!.y).toBeGreaterThanOrEqual(viewport.height * 0.38);
      expect(fullCardBox!.height).toBeLessThanOrEqual(viewport.height * 0.62);
    }
    await expect(card.getByRole("heading", { name: "G/F" })).toBeVisible();
    const place = page.locator(
      `[data-return-result="${browseIds.place}"]:visible`,
    );
    await expect(place).toBeVisible();
    await place.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(
        `/campus-map\\?v=1&scene=facility&id=${browseIds.place}&snap=peek$`,
      ),
    );
    await expect(
      page.getByRole("heading", { name: "正式测试饮水点" }),
    ).toBeFocused();
    const suggestEdit = page.getByRole("button", { name: "建议修改" });
    const locatePlace = page.getByRole("button", { name: "定位所属建筑" });
    const editHistory = page.getByRole("link", { name: "查看编辑记录" });
    await expect(suggestEdit).toBeVisible();
    await expect(locatePlace).toBeVisible();
    await expect(editHistory).toBeVisible();
    if (viewport.width < 768) {
      const placeCard = page.getByRole("region", {
        name: "正式测试饮水点",
      });
      const placeCardBox = await placeCard.boundingBox();
      expect(placeCardBox).not.toBeNull();
      expect(placeCardBox!.height).toBeLessThanOrEqual(268);
      await expect(
        placeCard.getByText(/饮水点 · 正式测试楼 · G\/F/),
      ).toBeVisible();
    }
    for (const action of [suggestEdit, locatePlace, editHistory]) {
      const actionBox = await action.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
        viewport.height,
      );
    }
  }
});
