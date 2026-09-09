// ref #814, #821, #838, #864, #880, #881, #890
import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { loginWithPassword } from "./helpers/auth";
import { installFakeCampusMapAmap } from "./helpers/campus-map-amap";

const buildingId = "00000000-0000-4000-8000-000000008141";
const floorId = "00000000-0000-4000-8000-000000008142";
const emptyFloorBuildingId = "00000000-0000-4000-8000-000000008143";
const mobileEmptyFloorBuildingId = "00000000-0000-4000-8000-000000008144";
const fixtureBuildingIds = [
  buildingId,
  emptyFloorBuildingId,
  mobileEmptyFloorBuildingId,
] as const;
const fixtureNames = ["QA 814 建筑级饮水机", "QA 814 楼层饮水机"] as const;
const updatedFixtureName = "QA 821 已更新楼层饮水机";
const cleanupNames = [...fixtureNames, updatedFixtureName];
const officialActionLabel = "QA 881 官网";
const officialActionUrl = "https://www.cuhk.edu.hk/qa-881";
const visitNote = "QA 881 只接受八达通。";

async function withClient<T>(operation: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function readCurrentFact(placeId: string) {
  return withClient(async (client) => {
    const result = await client.query<{
      revisionId: string;
      visitNote: string | null;
    }>(
      `select revision_id as "revisionId", visit_note as "visitNote"
         from campus_map_current_facts where place_id = $1`,
      [placeId],
    );
    const fact = result.rows[0];
    if (!fact) throw new Error(`missing Current fact for ${placeId}`);
    return fact;
  });
}

async function cleanupFixtures() {
  await withClient(async (client) => {
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      const places = await client.query<{ place_id: string }>(
        `select place_id from campus_map_current_facts
          where name = any($1::text[]) or building_id = any($2::uuid[])`,
        [cleanupNames, fixtureBuildingIds],
      );
      const placeIds = places.rows.map((row) => row.place_id);
      if (placeIds.length) {
        const revisions = await client.query<{
          changeset_id: string;
          provenance_id: string | null;
        }>(
          `select distinct revision.changeset_id, provenance.provenance_id
             from campus_map_fact_revisions revision
             left join campus_map_revision_provenance provenance
               on provenance.revision_id = revision.id
            where revision.place_id = any($1::uuid[])`,
          [placeIds],
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
          [placeIds],
        );
        await client.query(
          "delete from campus_map_current_revisions where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          `delete from campus_map_revision_visibility
            where revision_id in (
              select id from campus_map_fact_revisions
               where place_id = any($1::uuid[])
            )`,
          [placeIds],
        );
        await client.query(
          `delete from campus_map_revision_provenance
            where revision_id in (
              select id from campus_map_fact_revisions
               where place_id = any($1::uuid[])
            )`,
          [placeIds],
        );
        await client.query(
          "delete from campus_map_fact_revisions where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_place_changes where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_changesets where id = any($1::uuid[])",
          [changesetIds],
        );
        await client.query(
          "delete from campus_map_places where id = any($1::uuid[])",
          [placeIds],
        );
        if (provenanceIds.length) {
          await client.query(
            "delete from campus_map_provenance_sources where id = any($1::uuid[])",
            [provenanceIds],
          );
        }
      }
      await client.query(
        `delete from campus_map_floor_provenance
          where floor_id in (
            select id from campus_map_floors
             where building_id = any($1::uuid[])
          )`,
        [fixtureBuildingIds],
      );
      await client.query(
        "delete from campus_map_floors where building_id = any($1::uuid[])",
        [fixtureBuildingIds],
      );
      await client.query(
        "delete from campus_map_buildings where id = any($1::uuid[])",
        [fixtureBuildingIds],
      );
      await client.query("delete from campus_map_publish_rate_limits");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

test.beforeAll(async () => {
  await cleanupFixtures();
  await withClient(async (client) => {
    await client.query(
      `insert into campus_map_buildings
         (id, name, english_name, code, aliases, anchor_longitude, anchor_latitude, anchor_crs)
       values
         ($1, 'QA 814 测试楼', 'QA 814 Building', 'QA814', '{}',
           114.2072, 22.4191, 'wgs84'),
         ($2, 'QA 890 空楼层测试楼', 'QA 890 Empty Floor Building', 'QA890', '{}',
           114.2082, 22.4198, 'wgs84'),
         ($3, 'QA 890 移动空楼层测试楼', 'QA 890 Mobile Empty Floor Building', 'QA890M', '{}',
           114.2084, 22.4199, 'wgs84')`,
      [buildingId, emptyFloorBuildingId, mobileEmptyFloorBuildingId],
    );
    await client.query(
      `insert into campus_map_floors (id, building_id, display_label, sort_order)
       values ($1, $2, '1/F', 1)`,
      [floorId, buildingId],
    );
    await client.query(
      `insert into campus_map_floors (building_id, display_label, sort_order)
      values ($1, 'LG1', -1), ($2, '2/F', 2)`,
      [emptyFloorBuildingId, mobileEmptyFloorBuildingId],
    );
  });
});

test.afterAll(cleanupFixtures);

test.beforeEach(async ({ page }) => {
  await withClient((client) =>
    client.query("delete from campus_map_publish_rate_limits"),
  );
  await installFakeCampusMapAmap(page);
  await loginWithPassword(page, "user@test.com", "password123");
});

for (const scenario of [
  {
    viewportName: "desktop",
    viewport: { width: 1280, height: 800 },
    buildingId: emptyFloorBuildingId,
    buildingName: "QA 890 空楼层测试楼",
    floorLabel: "LG1",
  },
  {
    viewportName: "mobile",
    viewport: { width: 390, height: 844 },
    buildingId: mobileEmptyFloorBuildingId,
    buildingName: "QA 890 移动空楼层测试楼",
    floorLabel: "2/F",
  },
] as const) {
  test(`selects a builtin Floor from a Building card on ${scenario.viewportName}`, async ({
    page,
  }) => {
    await page.setViewportSize(scenario.viewport);
    await page.goto("/campus-map");
    const search = page.locator('input[placeholder="搜索建筑或地点…"]:visible');
    await search.fill(scenario.buildingName);
    await page.locator(`[data-search-result="${scenario.buildingId}"]`).click();
    await expect(
      page.getByRole("heading", { name: scenario.buildingName }),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: new RegExp(`在${scenario.buildingName}新增(?:第一处)?设施`, "u"),
      })
      .click();
    await page
      .getByRole("combobox", { name: "设施类型" })
      .selectOption("water");
    await expect(
      page.getByRole("option", { name: "添加缺失楼层…" }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "楼层" })
      .selectOption({ label: scenario.floorLabel });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", {
        name: "发布设施",
      })
      .click();

    await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
    const stablePlaceId = new URL(page.url()).searchParams.get("id");
    expect(stablePlaceId).not.toBeNull();
    await expect(page.getByRole("heading", { name: "饮水机" })).toBeVisible();
    await expect(
      page.getByText(
        `饮水点 · ${scenario.buildingName} · ${scenario.floorLabel}`,
        { exact: true },
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "建议修改" }).click();
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveCount(0);
    await page.getByRole("button", { name: "修改位置" }).click();
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveValue(
      scenario.buildingId,
    );
    const reopenedFloor = page.getByRole("combobox", { name: "楼层" });
    await expect(reopenedFloor.locator("option:checked")).toHaveText(
      scenario.floorLabel,
    );
    await page.getByRole("button", { name: "关闭地图编辑" }).click();

    await page.goto(
      `/campus-map?v=1&scene=building&id=${scenario.buildingId}&snap=full`,
    );
    const buildingCard = page.getByRole("region", {
      name: scenario.buildingName,
    });
    if (scenario.viewport.width < 768) {
      const floorSelect = buildingCard.getByRole("combobox", {
        name: "切换楼层",
      });
      await expect(
        floorSelect.getByRole("option", { name: scenario.floorLabel }),
      ).toHaveCount(1);
    } else {
      await expect(
        buildingCard.getByRole("button", {
          name: scenario.floorLabel,
          exact: true,
        }),
      ).toBeVisible();
    }
    await expect(buildingCard).toContainText("饮水点");

    const stored = await withClient((client) =>
      client.query<{ floorId: string; displayLabel: string }>(
        `select fact.floor_id as "floorId", floor.display_label as "displayLabel"
           from campus_map_current_facts fact
           join campus_map_floors floor
             on floor.building_id = fact.building_id and floor.id = fact.floor_id
          where fact.place_id = $1`,
        [stablePlaceId],
      ),
    );
    expect(stored.rows).toEqual([
      { floorId: expect.any(String), displayLabel: scenario.floorLabel },
    ]);
  });
}

for (const scenario of [
  {
    kind: "building",
    name: fixtureNames[0],
    pinType: "water",
    defaultName: "饮水机",
  },
  {
    kind: "floor",
    name: fixtureNames[1],
    pinType: "common-space",
    defaultName: "公共空间",
  },
] as const) {
  test(`publishes minimal ${scenario.kind} Add facts, then completes details in Edit`, async ({
    page,
  }) => {
    await page.setViewportSize(
      scenario.kind === "building"
        ? { width: 1280, height: 800 }
        : { width: 390, height: 844 },
    );
    await page.goto("/campus-map");
    await page.getByRole("button", { name: "新增设施" }).click();
    await expect(
      page.getByRole("heading", { name: "设施在哪里？" }),
    ).toBeVisible();
    await page
      .getByRole("searchbox", { name: "搜索建筑" })
      .fill("QA 814 测试楼");
    const buildingResult = page.locator(`[data-search-result="${buildingId}"]`);
    await expect(buildingResult).toContainText("QA 814 测试楼");
    await buildingResult.focus();
    await expect(buildingResult).toBeFocused();
    await buildingResult.press(
      scenario.kind === "building" ? "Enter" : "Space",
    );

    await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
    await expect(
      page.getByText("QA 814 测试楼", { exact: true }),
    ).toBeVisible();
    const placeType = page.getByRole("combobox", { name: "设施类型" });
    await placeType.selectOption(scenario.pinType);
    await expect(placeType).toHaveValue(scenario.pinType);
    if (scenario.kind === "floor") {
      await page.getByRole("combobox", { name: "楼层" }).selectOption(floorId);
    }
    await expect(
      page.getByRole("textbox", { name: "设施名称或编号" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "更多信息" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveCount(0);

    await page
      .getByRole("button", {
        name: "发布设施",
      })
      .click();
    await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
    const stablePlaceId = new URL(page.url()).searchParams.get("id");
    expect(stablePlaceId).not.toBeNull();
    await expect(
      page.getByRole("heading", { name: scenario.defaultName }),
    ).toBeVisible();
    await page.getByRole("button", { name: "建议修改" }).click();

    await expect(page.getByRole("heading", { name: "修改设施" })).toBeVisible();
    await page
      .getByRole("textbox", { name: "设施名称或编号" })
      .fill(scenario.name);
    await page.getByRole("button", { name: "更多信息" }).click();
    await page
      .getByRole("combobox", { name: "通常开放时间" })
      .selectOption("weekly");
    await page.getByRole("checkbox", { name: "周一" }).check();
    await page.getByRole("textbox", { name: "开始" }).fill("09:00");
    await page.getByRole("textbox", { name: "结束" }).fill("17:00");
    await page.getByRole("button", { name: "添加官方入口" }).click();
    await page
      .getByRole("textbox", { name: "官方入口 1 显示名称" })
      .fill(officialActionLabel);
    const officialActionTarget = page.getByRole("textbox", {
      name: "官方入口 1 链接或联系方式",
    });
    if (scenario.kind === "building") {
      await officialActionTarget.fill("http://unsafe.example.com");
      await page.getByRole("button", { name: "发布修改" }).click();
      await expect(
        page.getByText(/每个入口都要有名称，并使用安全的 https:\/\//u),
      ).toBeVisible();
    }
    await officialActionTarget.fill(officialActionUrl);
    await page.getByRole("textbox", { name: "备注" }).fill(visitNote);

    await page.getByRole("button", { name: "发布修改" }).click();
    await expect(page).toHaveURL(
      new RegExp(`scene=place&id=${stablePlaceId}&snap=peek$`),
    );
    await expect(
      page.getByRole("heading", { name: scenario.name }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: scenario.name }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(officialActionLabel) }),
    ).toHaveAttribute("href", officialActionUrl);
    const search = page.locator('input[placeholder="搜索建筑或地点…"]:visible');
    await search.fill(scenario.name);
    const result = page.locator("[data-search-result]").filter({
      hasText: scenario.name,
    });
    await expect(result).toBeVisible();
    await result.click();
    await page.getByRole("button", { name: "建议修改" }).click();

    await expect(page.getByRole("heading", { name: "修改设施" })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "设施名称或编号" }),
    ).toHaveValue(scenario.name);
    await expect(
      page.getByRole("combobox", { name: "通常开放时间" }),
    ).toHaveValue("weekly");
    await expect(page.getByRole("checkbox", { name: "周一" })).toBeChecked();
    await expect(page.getByRole("textbox", { name: "开始" })).toHaveValue(
      "09:00",
    );
    await expect(page.getByRole("textbox", { name: "结束" })).toHaveValue(
      "17:00",
    );
    await expect(
      page.getByRole("textbox", { name: "官方入口 1 显示名称" }),
    ).toHaveValue(officialActionLabel);
    await expect(
      page.getByRole("textbox", {
        name: "官方入口 1 链接或联系方式",
      }),
    ).toHaveValue(officialActionUrl);
    await expect(page.getByRole("textbox", { name: "备注" })).toHaveValue(
      visitNote,
    );

    await page.getByRole("button", { name: "修改位置" }).click();
    await expect(page.getByRole("radio", { name: "建筑内" })).toBeChecked();
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveValue(
      buildingId,
    );
    await expect(page.getByRole("combobox", { name: "楼层" })).toHaveValue(
      scenario.kind === "floor" ? floorId : "",
    );

    if (scenario.kind !== "building") return;

    const latestVisitNote = "QA 881 另一位编辑者的最新提示。";
    const staleVisitNote = "QA 881 过期草稿里的提示。";
    const concurrentPage = await page.context().newPage();
    await installFakeCampusMapAmap(concurrentPage);
    await concurrentPage.goto(
      `/campus-map?v=1&scene=place&id=${stablePlaceId}&snap=peek`,
    );
    await concurrentPage.getByRole("button", { name: "建议修改" }).click();
    await concurrentPage
      .getByRole("textbox", { name: "备注" })
      .fill(latestVisitNote);
    await concurrentPage.getByRole("button", { name: "发布修改" }).click();
    await expect(
      concurrentPage.getByRole("heading", { name: scenario.name }),
    ).toBeVisible();
    await concurrentPage.close();

    await page.getByRole("textbox", { name: "备注" }).fill(staleVisitNote);
    await page.getByRole("button", { name: "发布修改" }).click();
    await expect(page.getByText("这处地点刚刚被其他人更新")).toBeVisible();
    await expect(page.getByText(`我的：${staleVisitNote}`)).toBeVisible();
    await expect(page.getByText(`最新：${latestVisitNote}`)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "备注" })).toHaveValue(
      staleVisitNote,
    );
    await page.getByRole("button", { name: "采用最新资料" }).click();

    await page
      .getByRole("textbox", { name: "备注" })
      .fill("QA 881 不应发布的取消草稿。");
    await page.getByRole("button", { name: "关闭地图编辑" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "放弃未发布的修改？" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "放弃草稿" }).click();
    await expect(
      page.getByRole("heading", { name: scenario.name }),
    ).toBeVisible();
    await page.getByRole("button", { name: "建议修改" }).click();
    await expect(page.getByRole("textbox", { name: "备注" })).toHaveValue(
      latestVisitNote,
    );

    await page
      .getByRole("textbox", { name: "设施名称或编号" })
      .fill(updatedFixtureName);
    await page.getByRole("button", { name: "修改位置" }).click();
    await page.getByRole("combobox", { name: "楼层" }).selectOption(floorId);
    await page.getByRole("combobox", { name: "通常开放时间" }).selectOption("");
    await page.getByRole("button", { name: "发布修改" }).click();
    await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
    await expect(
      page.getByRole("heading", { name: updatedFixtureName }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: updatedFixtureName }),
    ).toBeVisible();
    const updatedSearch = page.locator(
      'input[placeholder="搜索建筑或地点…"]:visible',
    );
    await updatedSearch.fill(updatedFixtureName);
    const updatedResult = page.locator("[data-search-result]").filter({
      hasText: updatedFixtureName,
    });
    await expect(updatedResult).toBeVisible();
    await updatedResult.click();
    await page.getByRole("button", { name: "建议修改" }).click();

    await expect(
      page.getByRole("textbox", { name: "设施名称或编号" }),
    ).toHaveValue(updatedFixtureName);
    await page.getByRole("button", { name: "修改位置" }).click();
    await expect(page.getByRole("radio", { name: "建筑内" })).toBeChecked();
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveValue(
      buildingId,
    );
    await expect(page.getByRole("combobox", { name: "楼层" })).toHaveValue(
      floorId,
    );
    await expect(
      page.getByRole("combobox", { name: "通常开放时间" }),
    ).toHaveValue("");
  });
}

test("Building-card Add inherits its Building, exits cleanly, and rejects an ineligible editor", async ({
  page,
}) => {
  await page.goto("/campus-map");
  await page.getByPlaceholder("搜索建筑或地点…").fill("QA 814 测试楼");
  await page.locator(`[data-search-result="${buildingId}"]`).click();
  await expect(
    page.getByRole("heading", { name: "QA 814 测试楼" }),
  ).toBeVisible();

  const addFromBuildingCard = page.getByRole("button", {
    name: /在QA 814 测试楼新增(?:第一处)?设施/u,
  });
  await addFromBuildingCard.click();
  await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "QA 814 测试楼",
  );
  await expect(page.getByRole("combobox", { name: "建筑" })).toHaveCount(0);
  await page.getByRole("button", { name: "关闭地图编辑" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "放弃未发布的修改？" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "QA 814 测试楼" }),
  ).toBeVisible();

  await addFromBuildingCard.click();
  await page
    .getByRole("combobox", { name: "设施类型" })
    .selectOption("classroom");
  const classroomName = page.getByRole("textbox", {
    name: "课室编号",
  });
  await expect(classroomName).toHaveValue("");
  await page
    .getByRole("button", {
      name: "发布设施",
    })
    .click();
  await expect(classroomName).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("请填写课室编号。")).toBeVisible();
  await classroomName.fill("MMW 501");
  await page
    .getByRole("button", {
      name: "发布设施",
    })
    .click();
  await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
  const stablePlaceId = new URL(page.url()).searchParams.get("id");
  expect(stablePlaceId).not.toBeNull();
  if (!stablePlaceId) throw new Error("missing stable Place id");
  await expect(page.getByRole("heading", { name: "MMW 501" })).toBeVisible();
  const beforeDeniedPublish = await readCurrentFact(stablePlaceId);

  await withClient((client) =>
    client.query("update users set nickname = '' where email = $1", [
      "user@test.com",
    ]),
  );
  try {
    await page.goto(
      `/campus-map?v=1&scene=place&id=${stablePlaceId}&snap=peek`,
    );
    await page.getByRole("button", { name: "建议修改" }).click();
    await page.getByRole("button", { name: "更多信息" }).click();
    const ineligibleDraft = page.getByRole("textbox", { name: "备注" });
    await ineligibleDraft.fill("QA 881 资料未完成用户的草稿。");
    await page.getByRole("button", { name: "发布修改" }).click();
    await expect(
      page.getByRole("dialog", { name: "完善账户后继续" }),
    ).toBeVisible();
    await expect(ineligibleDraft).toHaveValue("QA 881 资料未完成用户的草稿。");
    const afterDeniedPublish = await readCurrentFact(stablePlaceId);
    expect(afterDeniedPublish).toEqual(beforeDeniedPublish);
  } finally {
    await withClient((client) =>
      client.query("update users set nickname = 'TestUser' where email = $1", [
        "user@test.com",
      ]),
    );
  }
});
