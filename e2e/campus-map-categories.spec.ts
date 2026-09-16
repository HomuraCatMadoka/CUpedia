// ref #910; fixture publishes only into the worktree's disposable E2E database.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import {
  approveCampusMapOfficialFacilityManifest,
  parseCampusMapOfficialFacilityManifest,
} from "@/lib/campus-map/official-facility-manifest";
import { importCampusMapOfficialFacilities } from "@/lib/campus-map/official-facility-import";
import { CAMPUS_MAP_CATEGORY_PREVIEW_LIMIT } from "@/lib/campus-map/category-directory";
import { assertSafeE2eDatabase } from "./runtime";
import { loginAsAdmin } from "./helpers/auth";
import { emulateColorScheme } from "./helpers/theme";
import {
  emitAmapEvent,
  installFakeCampusMapAmap,
} from "./helpers/campus-map-amap";

const parsed = parseCampusMapOfficialFacilityManifest(
  JSON.parse(
    readFileSync(
      "docs/campus-map/data/official-facilities-2026-09-07.json",
      "utf8",
    ),
  ),
);
if (parsed.status !== "valid") throw new Error(parsed.errors.join(", "));
const manifest = approveCampusMapOfficialFacilityManifest(
  parsed.manifest,
  "Disposable E2E fixture",
  "2026-09-14",
);
const classroomCount = manifest.entries.filter(
  ({ fact, decision }) =>
    decision.status === "publish" && fact?.placeType === "classroom",
).length;
const yiaBuilding = manifest.entries.find(
  ({ fact }) => fact?.name === "YIA 201",
)!.fact!.buildingId!;
const fixtureSources = manifest.entries
  .filter(({ decision }) => decision.status === "publish")
  .map(({ sourceRef }) => sourceRef);
let fixtureOwnsSources = false;
let fixtureFloorIds: string[] = [];

async function cleanupImportedFixture() {
  if (!fixtureOwnsSources) return;
  assertSafeE2eDatabase(process.env.DATABASE_URL!);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    // Match the existing E2E cleanup seam: only this fixture's rows are removed.
    await client.query("set local session_replication_role = replica");
    const records = await client.query<{
      place_id: string;
      revision_id: string;
      changeset_id: string;
      provenance_id: string;
    }>(
      `select revision.place_id, revision.id revision_id,
              revision.changeset_id, source.id provenance_id
         from campus_map_fact_revisions revision
         join campus_map_revision_provenance link on link.revision_id = revision.id
         join campus_map_provenance_sources source on source.id = link.provenance_id
        where source.source_kind = 'official' and source.source_ref = any($1::text[])`,
      [fixtureSources],
    );
    const placeIds = [...new Set(records.rows.map((row) => row.place_id))];
    const revisionIds = [
      ...new Set(records.rows.map((row) => row.revision_id)),
    ];
    const changesetIds = [
      ...new Set(records.rows.map((row) => row.changeset_id)),
    ];
    const provenanceIds = [
      ...new Set(records.rows.map((row) => row.provenance_id)),
    ];
    for (const [table, column, ids] of [
      ["campus_map_publish_requests", "changeset_id", changesetIds],
      ["campus_map_current_facts", "place_id", placeIds],
      ["campus_map_current_revisions", "place_id", placeIds],
      ["campus_map_revision_photos", "revision_id", revisionIds],
      ["campus_map_revision_visibility", "revision_id", revisionIds],
      ["campus_map_revision_provenance", "revision_id", revisionIds],
      ["campus_map_fact_revisions", "id", revisionIds],
      ["campus_map_place_changes", "place_id", placeIds],
      ["campus_map_changesets", "id", changesetIds],
      ["campus_map_places", "id", placeIds],
      ["campus_map_provenance_sources", "id", provenanceIds],
      ["campus_map_floor_provenance", "floor_id", fixtureFloorIds],
      ["campus_map_floors", "id", fixtureFloorIds],
    ] as const) {
      await client.query(
        `delete from ${table} where ${column} = any($1::uuid[])`,
        [ids],
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

test.describe
  .serial("Campus Map category discovery and imported-scale browsing (#910)", () => {
  test.beforeAll(async () => {
    test.setTimeout(60_000);
    assertSafeE2eDatabase(process.env.DATABASE_URL!);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    let actorId: string;
    try {
      const existing = await client.query(
        "select id from campus_map_provenance_sources where source_kind = 'official' and source_ref = any($1::text[])",
        [fixtureSources],
      );
      expect(
        existing.rows,
        "The isolated database must not already contain this imported fixture",
      ).toHaveLength(0);
      fixtureOwnsSources = true;
      const previousFloors = await client.query<{ id: string }>(
        "select id from campus_map_floors",
      );
      // Provisioning preserves the older floor fixtures; replay this idempotent
      // reference migration for the imported-scale fixture in this isolated DB.
      await client.query(
        readFileSync(
          "src/db/migrations/0131_campus_map_official_facility_floors.sql",
          "utf8",
        ),
      );
      const addedFloors = await client.query<{ id: string }>(
        "select id from campus_map_floors where not (id = any($1::uuid[]))",
        [previousFloors.rows.map(({ id }) => id)],
      );
      fixtureFloorIds = addedFloors.rows.map(({ id }) => id);
      actorId = (
        await client.query<{ id: string }>(
          "select id from users where email = $1",
          ["admin@test.com"],
        )
      ).rows[0]!.id;
    } finally {
      await client.end();
    }
    const previousBurstLimit = process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT;
    try {
      // Bulk fixture loading stays in this test worker and disposable DB.
      process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = "30";
      for (const batch of ["canary", "res"] as const) {
        const result = await importCampusMapOfficialFacilities(
          manifest,
          { actorId, clientIp: "127.0.9.10" },
          { batch },
        );
        expect(result, JSON.stringify(result)).toMatchObject({
          status: "imported",
        });
      }
    } finally {
      if (previousBurstLimit === undefined)
        delete process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT;
      else
        process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = previousBurstLimit;
    }
  });
  test.afterAll(cleanupImportedFixture);

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ]) {
    test(`classrooms preview, full Building groups and Place return at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await installFakeCampusMapAmap(page);
      await loginAsAdmin(page);
      await page.goto("/campus-map");
      await page.getByRole("button", { name: "课室", exact: true }).click();
      const list = page.locator('[data-campus-map-results="category"]');
      await expect(list.locator("[data-return-result]")).toHaveCount(
        CAMPUS_MAP_CATEGORY_PREVIEW_LIMIT,
      );
      await expect(
        page.getByText("全校园课室 · 按建筑、已知楼层与课室编号排列"),
      ).toBeVisible();
      const started = await page.evaluate(() => performance.now());
      await page
        .getByRole("button", { name: `查看全部 ${classroomCount} 处设施` })
        .click();
      await expect(list.locator("[data-return-result]")).toHaveCount(
        classroomCount,
      );
      console.log(
        `Imported classroom expansion at ${viewport.width}px: ${Math.round((await page.evaluate(() => performance.now())) - started)}ms (includes automation overhead), ${classroomCount} rows`,
      );
      await expect(page).toHaveURL(/id=classroom&snap=full$/);
      for (const scheme of ["light", "dark"] as const) {
        await emulateColorScheme(page, scheme);
        await page.screenshot({
          path: testInfo.outputPath(
            `classrooms-${viewport.width}-${scheme}.png`,
          ),
        });
      }
      await emulateColorScheme(page, "light");
      await page
        .getByRole("combobox", { name: "查找建筑分组" })
        .selectOption(`campus-map-category-building-${yiaBuilding}`);
      const group = page.locator(
        `section[aria-labelledby="campus-map-category-building-${yiaBuilding}"]`,
      );
      const names = await group
        .locator("[data-return-result] strong")
        .allTextContents();
      expect(names.indexOf("YIA 201")).toBeLessThan(names.indexOf("YIA 406"));
      const row = group.getByRole("button", { name: /^YIA 406/ });
      await row.scrollIntoViewIfNeeded();
      const scrollTop = await list.evaluate((element) => element.scrollTop);
      await row.click();
      await expect(
        page.getByRole("heading", { name: "YIA 406", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "返回课室列表" }).click();
      await expect(list.locator("[data-return-result]")).toHaveCount(
        classroomCount,
      );
      await expect(
        page.getByRole("button", { name: "收起至预览", expanded: true }),
      ).toBeVisible();
      await expect
        .poll(() => list.evaluate((element) => element.scrollTop))
        .toBeCloseTo(scrollTop, 0);
      await expect(row).toBeFocused();
      await emitAmapEvent(page, "moveend", {
        lnglat: { lng: 114.215, lat: 22.43 },
      });
      await expect(list.locator("[data-return-result]")).toHaveCount(
        classroomCount,
      );
      await expect(page).toHaveURL(/id=classroom&snap=full$/);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width);
      await page.getByRole("button", { name: "收起至预览" }).click();
      await expect(list.locator("[data-return-result]")).toHaveCount(
        CAMPUS_MAP_CATEGORY_PREVIEW_LIMIT,
      );
    });
  }

  test("More exposes outpatient and pool, and empty data offers another category", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installFakeCampusMapAmap(page);
    await loginAsAdmin(page);
    await page.goto("/campus-map");
    const more = page.getByRole("button", { name: "更多", exact: true });
    await more.focus();
    await more.press("Enter");
    await page.getByRole("menuitem", { name: "体育设施" }).press("End");
    await page.getByRole("menuitem", { name: "医疗服务" }).press("Enter");
    const categoryList = page.locator('[data-campus-map-results="category"]');
    const clinic = categoryList.getByRole("button", {
      name: /门诊（Outpatient Service）/,
    });
    await expect(clinic).toBeVisible();
    await clinic.click();
    await expect(
      page.getByRole("heading", {
        name: "门诊（Outpatient Service）",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "返回医疗服务列表" }).click();
    await expect(clinic).toBeFocused();
    await expect(
      page.getByRole("button", { name: "医疗服务", pressed: true }),
    ).toBeVisible();
    await more.click();
    await page.getByRole("menuitem", { name: "体育设施" }).click();
    await categoryList
      .getByRole("button", { name: /大学游泳池（University Swimming Pool）/ })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "大学游泳池（University Swimming Pool）",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "饮水点", exact: true }).click();
    await expect(
      page.getByText("资料仍待补充，校园中可能已有这类设施。"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "切换分类" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "新增饮水点" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /查看全部/ })).toHaveCount(0);
    await page.getByRole("button", { name: "切换分类" }).click();
    await expect(
      page.getByRole("heading", { name: "课室", exact: true }),
    ).toBeVisible();
  });
});
