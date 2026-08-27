// ref #646
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";

const browseIds = {
  building: "00000000-0000-4000-8000-000000006481",
  floor: "00000000-0000-4000-8000-000000006482",
  place: "00000000-0000-4000-8000-000000006483",
  changeset: "00000000-0000-4000-8000-000000006484",
  change: "00000000-0000-4000-8000-000000006485",
  revision: "00000000-0000-4000-8000-000000006486",
  actor: "00000000-0000-4000-8000-000000006487",
} as const;
const eligibleEmail = "1155000648@link.cuhk.edu.hk";

async function withBrowseFixture(action: "apply" | "cleanup") {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    if (action === "cleanup") {
      for (const statement of [
        "delete from campus_map_current_facts where place_id = $1",
        "delete from campus_map_current_revisions where place_id = $1",
        "delete from campus_map_revision_visibility where revision_id = $1",
        "delete from campus_map_fact_revisions where id = $1",
        "delete from campus_map_place_changes where id = $1",
        "delete from campus_map_changesets where id = $1",
        "delete from campus_map_places where id = $1",
        "delete from campus_map_floors where id = $1",
        "delete from campus_map_buildings where id = $1",
      ]) {
        const id =
          statement.includes("revision_visibility") ||
          statement.includes("fact_revisions")
            ? browseIds.revision
            : statement.includes("place_changes")
              ? browseIds.change
              : statement.includes("changesets")
                ? browseIds.changeset
                : statement.includes("floors")
                  ? browseIds.floor
                  : statement.includes("buildings")
                    ? browseIds.building
                    : browseIds.place;
        await client.query(statement, [id]);
      }
      await client.query(
        "delete from campus_map_fact_schemas where version = 648",
      );
      await client.query(
        "update users set email = 'user@test.com' where email = $1",
        [eligibleEmail],
      );
    } else {
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
         values ($1, '正式测试楼', 'Canonical Test Building', 'QA648',
           array['测试楼'], 114.2072, 22.4191, 'wgs84') on conflict do nothing`,
        [browseIds.building],
      );
      await client.query(
        `insert into campus_map_floors (id, building_id, display_label, sort_order)
         values ($1, $2, 'G/F', 0) on conflict do nothing`,
        [browseIds.floor, browseIds.building],
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
        [
          browseIds.place,
          browseIds.revision,
          browseIds.building,
          browseIds.floor,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

test.beforeAll(() => withBrowseFixture("apply"));
test.afterAll(() => withBrowseFixture("cleanup"));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeLngLat {
      constructor(
        public lng: number,
        public lat: number,
      ) {}
    }

    class FakePixel {
      constructor(
        public x: number,
        public y: number,
      ) {}
    }

    class FakeMap {
      private readonly handlers = new Map<
        string,
        Array<(payload: Record<string, unknown>) => void>
      >();
      private zoom: number;
      private center: FakeLngLat;

      constructor(
        private readonly containerId: string,
        options: { zoom?: number; center?: readonly [number, number] },
      ) {
        this.zoom = options.zoom ?? 17.2;
        this.center = new FakeLngLat(
          options.center?.[0] ?? 114.2072,
          options.center?.[1] ?? 22.4191,
        );
        const attribution = document.createElement("div");
        attribution.className = "amap-copyright";
        attribution.textContent = "高德地图参考";
        Object.assign(attribution.style, {
          position: "absolute",
          bottom: "0",
          left: "0",
          height: "16px",
        });
        document.getElementById(containerId)?.append(attribution);
      }

      on(event: string, handler: (payload: Record<string, unknown>) => void) {
        const handlers = this.handlers.get(event) ?? [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
      }

      plugin(_plugins: readonly string[], callback: () => void) {
        callback();
      }

      getZoom() {
        return this.zoom;
      }

      getCenter() {
        return this.center;
      }

      getContainer() {
        return document.getElementById(this.containerId)!;
      }

      setZoomAndCenter(
        zoom: number,
        center: FakeLngLat | readonly [number, number],
      ) {
        this.zoom = zoom;
        this.center =
          center instanceof FakeLngLat
            ? center
            : new FakeLngLat(center[0], center[1]);
      }

      lngLatToContainer() {
        const bounds = this.getContainer().getBoundingClientRect();
        return { x: bounds.width / 2, y: bounds.height / 2 };
      }

      containerToLngLat() {
        return this.center;
      }

      panTo() {}
      panBy() {}
      setBounds() {}
      zoomIn() {}
      zoomOut() {}
      destroy() {}
      remove() {}
      add() {}
    }

    class FakeGeocoder {
      getAddress(
        _position: readonly [number, number],
        callback: (status: string, result: unknown) => void,
      ) {
        queueMicrotask(() =>
          callback("complete", {
            info: "OK",
            regeocode: {
              formattedAddress: "香港中文大学",
              pois: [],
            },
          }),
        );
      }
    }

    Object.defineProperty(window, "AMap", {
      configurable: true,
      value: {
        Map: FakeMap,
        Geocoder: FakeGeocoder,
        LngLat: FakeLngLat,
        Pixel: FakePixel,
        Bounds: class {
          constructor(
            public southWest: FakeLngLat,
            public northEast: FakeLngLat,
          ) {}
        },
        plugin(_plugins: readonly string[], callback: () => void) {
          callback();
        },
        convertFrom(
          positions: readonly (readonly [number, number])[],
          _source: string,
          callback: (
            status: string,
            result: { locations: FakeLngLat[] },
          ) => void,
        ) {
          callback("complete", {
            locations: positions.map(
              ([longitude, latitude]) => new FakeLngLat(longitude, latitude),
            ),
          });
        },
      },
    });
  });

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
  await page.getByRole("button", { name: "添加地点" }).click();
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
  await expect(
    page.getByRole("heading", { name: "添加校内设施" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "洗手间" })).toBeChecked();
  await expect(page.getByRole("button", { name: "发布设施" })).toBeEnabled();
  await expect(page.getByText("地点资料已发布")).toHaveCount(0);
});

test("formal Campus Map keeps canonical Place identity through Back, Forward, and refresh", async ({
  page,
}) => {
  await page.goto("/campus-map");
  const search = page.getByPlaceholder("搜索建筑");
  await search.fill("正式测试饮水点");
  await page
    .getByRole("button", { name: /正式测试楼.*正式测试饮水点/ })
    .click();

  const canonicalUrl = new RegExp(
    `/campus-map\\?v=1&scene=facility&id=${browseIds.place}&snap=peek$`,
  );
  await expect(page).toHaveURL(canonicalUrl);
  await expect(
    page.getByRole("heading", { name: "正式测试饮水点" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/scene=search/);
  await expect(
    page.getByRole("button", { name: /正式测试楼.*正式测试饮水点/ }),
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
});

test("publish handoff opens one searchable Place and Back never restores the completed form", async ({
  page,
}) => {
  const publishedName = "打印站";
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "添加地点" }).click();
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

  await page.goBack();
  await expect(page.getByRole("heading", { name: "添加校内设施" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: "选择设施位置" })).toHaveCount(
    0,
  );

  await page.goForward();
  await expect(page).toHaveURL(publishedUrl.toString());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: publishedName }),
  ).toBeVisible();

  await page.getByPlaceholder("搜索建筑").fill(publishedName);
  const publishedResult = page.locator(`[data-search-result="${placeId}"]`);
  await expect(publishedResult).toBeVisible();
  await publishedResult.click();
  await expect(page).toHaveURL(
    new RegExp(`/campus-map\\?v=1&scene=facility&id=${placeId}&snap=peek$`),
  );
});

test("Campus Map editing keeps its primary action inside a 390px-high viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 390 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "添加地点" }).click();
  const confirmPosition = page.getByRole("button", { name: "使用此位置" });
  await expect(confirmPosition).toBeEnabled();
  await confirmPosition.click();

  const sheet = page.getByRole("region", { name: "添加校内设施" });
  const publish = page.getByRole("button", { name: "发布设施" });
  await expect(sheet).toBeVisible();
  await expect(publish).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThanOrEqual(390 * 0.35);
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(390);
  expect(publishBox!.y + publishBox!.height).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(390);
});

test("Campus Map editing keeps only the essential controls in a compact mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 545, height: 688 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "添加地点" }).click();
  await page.getByRole("button", { name: "使用此位置" }).click();

  const sheet = page.getByRole("region", { name: "添加校内设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", { name: "发布设施" });
  const attribution = page.locator(".amap-copyright");
  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await facilityType.boundingBox();
  const publishBox = await publish.boundingBox();
  const attributionBox = await attribution.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(attributionBox).not.toBeNull();
  expect(facilityTypeBox!.y + facilityTypeBox!.height).toBeLessThanOrEqual(
    publishBox!.y,
  );
  await expect(
    page.getByRole("textbox", { name: "设施名称或编号" }),
  ).toHaveCount(0);
  await expect(page.getByText("资料依据")).toHaveCount(0);
  expect(attributionBox!.y + attributionBox!.height).toBeLessThanOrEqual(
    sheetBox!.y,
  );
});

test("Campus Map editing supports the keyboard placement and dirty-close path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "添加地点" }).click();
  await page.getByRole("button", { name: "使用此位置" }).click();

  const sheet = page.getByRole("region", { name: "添加校内设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", { name: "发布设施" });
  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await facilityType.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThanOrEqual(720 * 0.35);
  expect(facilityTypeBox!.y + facilityTypeBox!.height).toBeLessThanOrEqual(
    publishBox!.y,
  );

  const reposition = page.getByRole("button", { name: "修改位置" });
  await reposition.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "选择设施位置" }),
  ).toBeVisible();

  const coordinateEntry = page.getByRole("button", { name: "输入坐标" });
  await coordinateEntry.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "经度（WGS84）" }).fill("114.2072");
  await page.getByRole("textbox", { name: "纬度（WGS84）" }).fill("22.4191");
  const useCoordinates = page.getByRole("button", { name: "使用输入坐标" });
  await useCoordinates.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "添加校内设施" }),
  ).toBeFocused();
  await page.getByRole("radio", { name: "洗手间" }).press("Space");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("alertdialog", { name: "放弃未发布的修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByRole("radio", { name: "洗手间" })).toBeChecked();
});
