// ref #646, #649, #814, #838, #864, #880, #888, #889
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";
import {
  emitAmapEvent,
  installFakeCampusMapAmap,
} from "./helpers/campus-map-amap";

const adminUserId = "00000000-0000-4000-a000-000000000001";
const adminEmail = "admin@test.com";
const eligibleAdminEmail = "1155000889@link.cuhk.edu.hk";

async function setAdminEmail(email: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("update users set email = $1 where id = $2", [
      email,
      adminUserId,
    ]);
  } finally {
    await client.end();
  }
}

test.beforeAll(() => setAdminEmail(eligibleAdminEmail));
test.afterAll(() => setAdminEmail(adminEmail));

test.beforeEach(async ({ page }) => {
  await installFakeCampusMapAmap(page);
  await loginWithPassword(page, eligibleAdminEmail, "password123");
});

async function startBuildingFacilityAdd(page: Page) {
  await page.getByRole("button", { name: "新增设施" }).click();
  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "搜索建筑" }).fill("科学馆");
  await page.getByRole("button", { name: "科学馆", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
}

test("Campus Map keeps mobile keyboard controls readable through viewport resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");

  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).toContain("width=device-width");
  expect(viewport).not.toContain("maximum-scale");
  expect(viewport).not.toContain("user-scalable=no");

  const mapSearch = page.getByRole("textbox", { name: "搜索建筑或地点" });
  await expect(mapSearch).toHaveCSS("font-size", "16px");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(mapSearch).toHaveCSS("font-size", "16px");
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole("button", { name: "课室", exact: true }).click();
  const categoryHeading = page.getByRole("heading", { name: "课室" });
  const closeCategory = page.getByRole("button", { name: "关闭课室列表" });
  await mapSearch.focus();
  await page.setViewportSize({ width: 390, height: 390 });
  await expect(mapSearch).toBeInViewport();
  await expect(categoryHeading).toBeInViewport();
  await expect(closeCategory).toBeInViewport();
  await expect(page.locator("#amap-campus-canvas")).toHaveCSS(
    "height",
    "390px",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mapSearch).toBeInViewport();
  await expect(categoryHeading).toBeInViewport();
  await expect(closeCategory).toBeInViewport();
  await closeCategory.click();

  await page.getByRole("button", { name: "新增设施" }).click();
  const buildingSearch = page.getByRole("searchbox", { name: "搜索建筑" });
  await expect(buildingSearch).toHaveCSS("font-size", "16px");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(buildingSearch).toHaveCSS("font-size", "16px");
  await page.setViewportSize({ width: 390, height: 844 });
  await buildingSearch.focus();
  await page.setViewportSize({ width: 390, height: 390 });
  await expect(buildingSearch).toBeInViewport();
  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeInViewport();
  await expect(page.getByRole("button", { name: "室外" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(buildingSearch).toBeInViewport();
  await expect(page.getByRole("button", { name: "室外" })).toHaveCount(0);

  await buildingSearch.fill("科学馆");
  await page.getByRole("button", { name: "科学馆", exact: true }).click();
  await expect(page.getByRole("button", { name: "发布设施" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "输入坐标" })).toHaveCount(0);
});

test("Campus Map keeps every Add form text control at least 16px on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/campus-map");
  await startBuildingFacilityAdd(page);

  const undersizedControls = await page
    .getByRole("dialog", { name: "新增设施" })
    .locator(
      'input:not([type="button"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="image"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"]), select, textarea',
    )
    .evaluateAll((controls) =>
      controls.flatMap((control) => {
        const element = control as HTMLInputElement;
        if (element.disabled || element.getClientRects().length === 0)
          return [];
        const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
        return fontSize < 16
          ? [
              {
                name:
                  element.getAttribute("aria-label") ??
                  element.getAttribute("name") ??
                  element.tagName.toLowerCase(),
                fontSize,
              },
            ]
          : [];
      }),
    );

  expect(undersizedControls).toEqual([]);
});

test("Campus Map editing keeps the map above the Add sheet in a 720×844 viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 844 });
  await page.goto("/campus-map");

  await startBuildingFacilityAdd(page);

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", {
    name: "发布设施",
  });
  await expect(sheet).toBeVisible();
  await expect(publish).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThan(0);
  expect(sheetBox!.height).toBeLessThanOrEqual(640);
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(844);
  expect(publishBox!.y + publishBox!.height).toBeLessThanOrEqual(844);
  const typeBox = await facilityType.boundingBox();
  expect(typeBox).not.toBeNull();
  expect(publishBox!.y - (typeBox!.y + typeBox!.height)).toBeLessThan(64);
  const typeSelectBox = await page
    .getByRole("combobox", { name: "设施类型" })
    .boundingBox();
  expect(typeSelectBox).not.toBeNull();
  expect(typeSelectBox!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(844);
});

test("Campus Map editing keeps its sticky action usable in a 390px-high viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 390 });
  await page.goto("/campus-map");

  await startBuildingFacilityAdd(page);

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const publish = page.getByRole("button", {
    name: "发布设施",
  });
  const sheetBox = await sheet.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThan(0);
  expect(sheetBox!.height).toBeLessThanOrEqual(320);
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(390);
  expect(publishBox!.y + publishBox!.height).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(390);
});

test("Campus Map editing keeps only the essential controls in a compact mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");

  await startBuildingFacilityAdd(page);

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", {
    name: "发布设施",
  });
  const attribution = page.locator(".amap-copyright");
  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await facilityType.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThan(0);
  expect(sheetBox!.height).toBeLessThanOrEqual(640);
  expect(facilityTypeBox!.y + facilityTypeBox!.height).toBeLessThanOrEqual(
    publishBox!.y,
  );
  const typeSelect = page.getByRole("combobox", { name: "设施类型" });
  await expect(typeSelect).toBeInViewport();
  await expect(typeSelect.getByRole("option")).toHaveCount(5);
  for (const label of ["饮水点", "洗手间", "公共空间", "课室"]) {
    await expect(typeSelect.getByRole("option", { name: label })).toHaveCount(
      1,
    );
  }
  await expect(
    page.getByText("位置已确定。选择设施类型后即可发布。"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "设施名称或编号" }),
  ).toHaveCount(0);
  await expect(page.getByRole("group", { name: "位置" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "室外" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "建筑内" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "修改位置" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "更换", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "更多信息" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "开放与使用条件" })).toHaveCount(
    0,
  );
  await expect(page.getByText("资料依据")).toHaveCount(0);
  await expect(attribution).toBeInViewport();
});

test("Campus Map editing keeps the minimal Add facts beside the desktop map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");

  await startBuildingFacilityAdd(page);

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const publish = page.getByRole("button", {
    name: "发布设施",
  });
  await expect(
    page.getByRole("textbox", { name: "设施名称或编号" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更多信息" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "位置" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "室外" })).toHaveCount(0);
  await expect(publish).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await page
    .getByRole("group", { name: "设施类型" })
    .boundingBox();
  const locationBox = await page
    .locator('[data-edit-field="location"]')
    .boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(locationBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.x).toBeGreaterThanOrEqual(800);
  expect(sheetBox!.width).toBeGreaterThanOrEqual(388);
  expect(sheetBox!.width).toBeLessThanOrEqual(392);
  for (const controlBox of [facilityTypeBox!, locationBox!]) {
    expect(controlBox.width).toBeGreaterThanOrEqual(300);
    expect(controlBox.x).toBeGreaterThanOrEqual(sheetBox!.x);
    expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
      sheetBox!.x + sheetBox!.width,
    );
  }
  expect(publishBox!.y + publishBox!.height).toBeLessThanOrEqual(800);
});

test("Campus Map Add offers the preserved official Building directory", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "新增设施" }).click();

  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeVisible();
  // Provisioning preserves migration-owned buildings. Empty-directory behavior
  // is covered with an explicitly empty projection in the component tests.
  await expect(page.getByText("当前没有已收录建筑。")).toHaveCount(0);
  await expect(page.locator("[data-campus-map-building-picker]")).toHaveCount(
    0,
  );
  const buildingSearch = page.getByRole("searchbox", { name: "搜索建筑" });
  await buildingSearch.fill("科学馆");
  await expect(
    page.getByRole("button", { name: /科学馆/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "室外" })).toHaveCount(0);
  const locationSheet = page.getByRole("dialog", { name: "设施在哪里？" });
  const locationSheetBox = await locationSheet.boundingBox();
  expect(locationSheetBox).not.toBeNull();
  expect(locationSheetBox!.y).toBeLessThanOrEqual(17);
  expect(locationSheetBox!.height).toBeLessThanOrEqual(480);
  await expect(
    page.getByRole("button", {
      name: "发布设施",
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "建筑" })).toHaveCount(0);
});

test("Campus Map Add keeps the touch directory fallback readable without duplicate markers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();

  await expect(page.locator("[data-campus-map-building-picker]")).toHaveCount(
    0,
  );
  await page.getByRole("searchbox", { name: "搜索建筑" }).fill("科学馆");
  const result = page.getByRole("button", { name: /科学馆/ }).first();
  await expect(result).toBeVisible();
  const resultBox = await result.boundingBox();
  expect(resultBox).not.toBeNull();
  expect(resultBox!.height).toBeGreaterThanOrEqual(44);
  await result.click();

  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "科学馆",
  );
  await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
  await page.getByRole("button", { name: "更换", exact: true }).click();
  await page.getByRole("button", { name: "取消重选" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "科学馆",
  );
  await expect(
    page.getByRole("button", {
      name: "发布设施",
    }),
  ).toBeInViewport();
});

test("Campus Map editing supports the minimal Add dirty-close path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/campus-map");

  await startBuildingFacilityAdd(page);

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", {
    name: "发布设施",
  });
  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await facilityType.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThan(0);
  expect(sheetBox!.height).toBeLessThanOrEqual(640);
  expect(facilityTypeBox!.y + facilityTypeBox!.height).toBeLessThanOrEqual(
    publishBox!.y,
  );

  await expect(page.getByRole("heading", { name: "新增设施" })).toBeFocused();
  await expect(page.getByRole("group", { name: "位置" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "更换", exact: true }),
  ).toBeVisible();
  const typeSelect = page.getByRole("combobox", { name: "设施类型" });
  await typeSelect.selectOption("toilet");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("alertdialog", { name: "放弃未发布的修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(typeSelect).toHaveValue("toilet");
});

test("missing-building feedback submits a map note and returns to the facility draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施" }).click();
  await expect(
    page.getByRole("heading", { name: "设施在哪里？" }),
  ).toBeVisible();
  await emitAmapEvent(page, "hotspotclick", {
    id: "qa-unmapped-building",
    name: "QA 未收录教学楼",
    lnglat: { lng: 114.2084, lat: 22.4198 },
  });
  await page.getByRole("button", { name: "找不到这栋建筑" }).click();
  await expect(page.getByRole("textbox", { name: "建筑名称" })).toHaveValue(
    "QA 未收录教学楼",
  );
  await page
    .getByRole("textbox", { name: "补充说明（选填）" })
    .fill("测试楼入口附近");
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect(
    page.getByText("请先选择建筑位置。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "使用图钉位置" }).click();
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect(page.getByRole("link", { name: "查看反馈" })).toBeVisible();
  await page.getByRole("button", { name: "返回选建筑" }).click();
  await expect(page.getByRole("searchbox", { name: "搜索建筑" })).toBeVisible();
  await page.getByRole("searchbox", { name: "搜索建筑" }).fill("科学馆");
  await page.getByRole("button", { name: "科学馆", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "发布设施",
    }),
  ).toBeInViewport();
});

test("changing the building can be cancelled without losing the selected floor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");
  await page.getByRole("button", { name: "新增设施", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索建筑" }).fill("诚明馆");
  await page.getByRole("button", { name: "诚明馆", exact: true }).click();
  await page
    .getByRole("combobox", { name: "楼层" })
    .selectOption({ label: "2 楼" });
  await page.getByRole("button", { name: "更换", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "室外", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("searchbox", { name: "搜索建筑" }).fill("科学馆");
  await page.getByRole("button", { name: "取消重选", exact: true }).click();
  await expect(page.getByRole("group", { name: "位置" })).toContainText(
    "诚明馆",
  );
  await expect(
    page.getByRole("combobox", { name: "楼层" }).locator("option:checked"),
  ).toHaveText("2 楼");
});
