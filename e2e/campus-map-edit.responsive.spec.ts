// ref #646, #649, #814, #838
import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";
import { installFakeCampusMapAmap } from "./helpers/campus-map-amap";

test.beforeEach(async ({ page }) => {
  await installFakeCampusMapAmap(page);
  await loginWithPassword(page, "admin@test.com", "password123");
});

test("Campus Map editing uses a full-screen task surface in a 720×844 viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 844 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "新增设施" }).click();

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", { name: "发布设施" });
  await expect(sheet).toBeVisible();
  await expect(publish).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeLessThanOrEqual(1);
  expect(sheetBox!.height).toBeGreaterThanOrEqual(843);
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(844);
  expect(publishBox!.y + publishBox!.height).toBeLessThanOrEqual(844);
  expect(
    await facilityType
      .locator("label")
      .evaluateAll(
        (labels) =>
          new Set(
            labels.map((label) =>
              Math.round(label.getBoundingClientRect().top),
            ),
          ).size,
      ),
  ).toBe(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(844);
});

test("Campus Map editing keeps its full-screen action usable in a 390px-high viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 390 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "新增设施" }).click();

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const publish = page.getByRole("button", { name: "发布设施" });
  const sheetBox = await sheet.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeLessThanOrEqual(1);
  expect(sheetBox!.height).toBeGreaterThanOrEqual(389);
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

  await page.getByRole("button", { name: "新增设施" }).click();

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", { name: "发布设施" });
  const attribution = page.locator(".amap-copyright");
  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await facilityType.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeLessThanOrEqual(1);
  expect(sheetBox!.height).toBeGreaterThanOrEqual(843);
  expect(facilityTypeBox!.y + facilityTypeBox!.height).toBeLessThanOrEqual(
    publishBox!.y,
  );
  for (const label of ["饮水点", "洗手间", "打印服务", "公共空间", "课室"]) {
    await expect(
      facilityType.getByText(label, { exact: true }),
    ).toBeInViewport();
  }
  const choices = await facilityType.locator("label").all();
  const choiceBoxes = await Promise.all(
    choices.map((choice) => choice.boundingBox()),
  );
  expect(new Set(choiceBoxes.map((box) => Math.round(box?.y ?? -1))).size).toBe(
    2,
  );
  for (const box of choiceBoxes) {
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(
    page.getByText("位置已确定。选择设施类型后即可发布。"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "设施名称或编号" }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "所属建筑" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "室外" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "建筑内" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "修改位置" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更多信息" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByRole("group", { name: "开放与使用条件" })).toHaveCount(
    0,
  );
  await expect(page.getByText("资料依据")).toHaveCount(0);
  await expect(attribution).not.toBeInViewport();

  await page.getByRole("button", { name: "更多信息" }).click();
  const audience = page.getByRole("combobox", { name: "开放对象" });
  await audience.focus();
  await expect(audience).toBeInViewport();
  const audienceBox = await audience.boundingBox();
  const focusedPublishBox = await publish.boundingBox();
  expect(audienceBox).not.toBeNull();
  expect(focusedPublishBox).not.toBeNull();
  expect(audienceBox!.y + audienceBox!.height).toBeLessThanOrEqual(
    focusedPublishBox!.y,
  );
});

test("Campus Map editing exposes canonical facts without covering the desktop map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "新增设施" }).click();

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const name = page.getByRole("textbox", { name: "设施名称或编号" });
  const building = page.getByRole("combobox", { name: "建筑" });
  const floor = page.getByRole("combobox", { name: "楼层" });
  const publish = page.getByRole("button", { name: "发布设施" });
  await expect(name).toHaveValue("饮水机");
  await name.fill("大学站广场饮水机 A");
  await page.getByRole("button", { name: "更多信息" }).click();
  await page
    .getByRole("combobox", { name: "开放对象" })
    .selectOption("cuhk-member");
  await expect(page.getByRole("group", { name: "所属建筑" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "室外" })).toHaveCount(0);
  await expect(publish).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  const buildingBox = await building.boundingBox();
  const floorBox = await floor.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(buildingBox).not.toBeNull();
  expect(floorBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.x).toBeGreaterThanOrEqual(800);
  expect(sheetBox!.width).toBeGreaterThanOrEqual(388);
  expect(sheetBox!.width).toBeLessThanOrEqual(392);
  for (const controlBox of [buildingBox!, floorBox!]) {
    expect(controlBox.width).toBeGreaterThanOrEqual(300);
    expect(controlBox.x).toBeGreaterThanOrEqual(sheetBox!.x);
    expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
      sheetBox!.x + sheetBox!.width,
    );
  }
  expect(publishBox!.y + publishBox!.height).toBeLessThanOrEqual(800);
});

test("Campus Map editing requires a Building when none is available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "新增设施" }).click();

  const building = page.getByRole("combobox", { name: "建筑" });
  const floor = page.getByRole("combobox", { name: "楼层" });
  const publish = page.getByRole("button", { name: "发布设施" });
  await expect(page.getByRole("group", { name: "所属建筑" })).toBeVisible();
  await expect(building).toBeDisabled();
  await expect(floor).toBeDisabled();
  await expect(publish).toBeDisabled();
  await expect(
    page.getByText("目前没有可选建筑，暂时无法新增设施。"),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "室外" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "建筑内" })).toHaveCount(0);

  const buildingBox = await building.boundingBox();
  const floorBox = await floor.boundingBox();
  expect(buildingBox).not.toBeNull();
  expect(floorBox).not.toBeNull();
  expect(floorBox!.y).toBeGreaterThanOrEqual(
    buildingBox!.y + buildingBox!.height,
  );
});

test("Campus Map editing supports the building-first dirty-close path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "新增设施" }).click();

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", { name: "发布设施" });
  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await facilityType.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(sheetBox!.y).toBeLessThanOrEqual(1);
  expect(sheetBox!.height).toBeGreaterThanOrEqual(719);
  expect(facilityTypeBox!.y + facilityTypeBox!.height).toBeLessThanOrEqual(
    publishBox!.y,
  );

  await expect(page.getByRole("heading", { name: "新增设施" })).toBeFocused();
  await expect(page.getByRole("group", { name: "所属建筑" })).toBeVisible();
  await expect(page.getByRole("button", { name: "修改位置" })).toHaveCount(0);
  await page.getByRole("radio", { name: "洗手间" }).press("Space");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("alertdialog", { name: "放弃未发布的修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByRole("radio", { name: "洗手间" })).toBeChecked();
});
