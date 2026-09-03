// ref #814, #821, #838, #864
import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { loginWithPassword } from "./helpers/auth";
import { installFakeCampusMapAmap } from "./helpers/campus-map-amap";

const buildingId = "00000000-0000-4000-8000-000000008141";
const floorId = "00000000-0000-4000-8000-000000008142";
const fixtureNames = ["QA 814 建筑级饮水机", "QA 814 楼层饮水机"] as const;
const updatedFixtureName = "QA 821 已更新楼层饮水机";
const cleanupNames = [...fixtureNames, updatedFixtureName];

async function withClient<T>(operation: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function cleanupFixtures() {
  await withClient(async (client) => {
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      const places = await client.query<{ place_id: string }>(
        "select place_id from campus_map_current_facts where name = any($1::text[])",
        [cleanupNames],
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
      await client.query("delete from campus_map_floors where id = $1", [
        floorId,
      ]);
      await client.query("delete from campus_map_buildings where id = $1", [
        buildingId,
      ]);
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
       values ($1, 'QA 814 测试楼', 'QA 814 Building', 'QA814', '{}',
         114.2072, 22.4191, 'wgs84')`,
      [buildingId],
    );
    await client.query(
      `insert into campus_map_floors (id, building_id, display_label, sort_order)
       values ($1, $2, '1/F', 1)`,
      [floorId, buildingId],
    );
  });
});

test.afterAll(cleanupFixtures);

test.beforeEach(async ({ page }) => {
  await installFakeCampusMapAmap(page);
  await loginWithPassword(page, "admin@test.com", "password123");
});

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
    pinType: "printer",
    defaultName: "打印站",
  },
] as const) {
  test(`publishes minimal ${scenario.kind} Add facts, then completes details in Edit`, async ({
    page,
  }) => {
    await page.goto("/campus-map");
    await page.getByRole("button", { name: "新增设施" }).click();
    await expect(
      page.getByRole("heading", { name: "设施在哪里？" }),
    ).toBeVisible();
    const buildingPicker = page.getByRole("button", {
      name: "选择QA 814 测试楼作为所属建筑",
    });
    await expect(buildingPicker).toContainText("QA 814 测试楼");
    const buildingPickerBox = await buildingPicker.boundingBox();
    expect(buildingPickerBox).not.toBeNull();
    expect(buildingPickerBox!.height).toBeGreaterThanOrEqual(44);
    expect(buildingPickerBox!.width).toBeGreaterThanOrEqual(44);
    await page.locator('input[name="campus-map-search"]').focus();
    await page.keyboard.press("Shift+Tab");
    await expect(buildingPicker).toBeFocused();
    await expect(buildingPicker.locator("span").last()).toHaveCSS(
      "opacity",
      "1",
    );
    await buildingPicker.press(
      scenario.kind === "building" ? "Enter" : "Space",
    );
    await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
    await expect(
      page.getByText("QA 814 测试楼", { exact: true }),
    ).toBeVisible();
    const pinType = page.getByRole("radio", {
      name: scenario.pinType === "water" ? "饮水点" : "打印服务",
    });
    await pinType.focus();
    await pinType.press("Space");
    if (scenario.kind === "floor") {
      await page.getByRole("combobox", { name: "楼层" }).selectOption(floorId);
    }
    await expect(
      page.getByRole("textbox", { name: "设施名称或编号" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "更多信息" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveCount(0);

    await page.getByRole("button", { name: "发布设施" }).click();
    await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
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
      .getByRole("combobox", { name: "开放对象" })
      .selectOption("cuhk-member");
    await page
      .getByRole("combobox", { name: "凭证要求" })
      .selectOption("campus-card");
    await page
      .getByRole("combobox", { name: "预约要求" })
      .selectOption("required");
    await page
      .getByRole("combobox", { name: "临时状态" })
      .selectOption("normal");
    await page
      .getByRole("combobox", { name: "开放时间" })
      .selectOption("weekly");
    await page.getByRole("checkbox", { name: "周一" }).check();
    await page.getByRole("textbox", { name: "开始" }).fill("09:00");
    await page.getByRole("textbox", { name: "结束" }).fill("17:00");

    await page.getByRole("button", { name: "发布修改" }).click();
    await expect(page).toHaveURL(/scene=place&id=[0-9a-f-]+&snap=peek$/);
    await expect(
      page.getByRole("heading", { name: scenario.name }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: scenario.name }),
    ).toBeVisible();
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
    await expect(page.getByRole("combobox", { name: "开放对象" })).toHaveValue(
      "cuhk-member",
    );
    await expect(page.getByRole("combobox", { name: "凭证要求" })).toHaveValue(
      "campus-card",
    );
    await expect(page.getByRole("combobox", { name: "预约要求" })).toHaveValue(
      "required",
    );
    await expect(page.getByRole("combobox", { name: "临时状态" })).toHaveValue(
      "normal",
    );
    await expect(page.getByRole("combobox", { name: "开放时间" })).toHaveValue(
      "weekly",
    );
    await expect(page.getByRole("checkbox", { name: "周一" })).toBeChecked();
    await expect(page.getByRole("textbox", { name: "开始" })).toHaveValue(
      "09:00",
    );
    await expect(page.getByRole("textbox", { name: "结束" })).toHaveValue(
      "17:00",
    );

    await expect(page.getByRole("radio", { name: "建筑内" })).toBeChecked();
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveValue(
      buildingId,
    );
    await expect(page.getByRole("combobox", { name: "楼层" })).toHaveValue(
      scenario.kind === "floor" ? floorId : "",
    );

    if (scenario.kind !== "building") return;

    await page
      .getByRole("textbox", { name: "设施名称或编号" })
      .fill(updatedFixtureName);
    await page.getByRole("combobox", { name: "楼层" }).selectOption(floorId);
    await page
      .getByRole("combobox", { name: "开放对象" })
      .selectOption("public");
    await page.getByRole("combobox", { name: "凭证要求" }).selectOption("none");
    await page.getByRole("combobox", { name: "预约要求" }).selectOption("none");
    await page
      .getByRole("combobox", { name: "临时状态" })
      .selectOption("temporarily-closed");
    await page
      .getByRole("combobox", { name: "开放时间" })
      .selectOption("always");
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
    await expect(page.getByRole("radio", { name: "建筑内" })).toBeChecked();
    await expect(page.getByRole("combobox", { name: "建筑" })).toHaveValue(
      buildingId,
    );
    await expect(page.getByRole("combobox", { name: "楼层" })).toHaveValue(
      floorId,
    );
    await expect(page.getByRole("combobox", { name: "开放对象" })).toHaveValue(
      "public",
    );
    await expect(page.getByRole("combobox", { name: "凭证要求" })).toHaveValue(
      "none",
    );
    await expect(page.getByRole("combobox", { name: "预约要求" })).toHaveValue(
      "none",
    );
    await expect(page.getByRole("combobox", { name: "开放时间" })).toHaveValue(
      "always",
    );
    await expect(page.getByRole("combobox", { name: "临时状态" })).toHaveValue(
      "temporarily-closed",
    );
  });
}
