// ref #646, #649, #814, #838, #864
import { expect, test, type Page } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";
import { installFakeCampusMapAmap } from "./helpers/campus-map-amap";

test.beforeEach(async ({ page }) => {
  await installFakeCampusMapAmap(page);
  await loginWithPassword(page, "admin@test.com", "password123");
});

async function startOutdoorFacilityAdd(page: Page) {
  await page.getByRole("button", { name: "新增设施" }).click();
  await expect(
    page.getByRole("heading", { name: "选择设施位置" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "这是室外设施" }).click();
  const usePosition = page.getByRole("button", { name: "使用此位置" });
  await expect(usePosition).toBeEnabled();
  await usePosition.click();
  await expect(page.getByRole("heading", { name: "新增设施" })).toBeVisible();
}

test("Campus Map editing uses a full-screen task surface in a 720×844 viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 844 });
  await page.goto("/campus-map");

  await startOutdoorFacilityAdd(page);

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

  await startOutdoorFacilityAdd(page);

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

  await startOutdoorFacilityAdd(page);

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
  ).toHaveCount(0);
  await expect(page.getByRole("group", { name: "所属建筑" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "室外" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "建筑内" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "修改位置" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更改位置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "更多信息" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "开放与使用条件" })).toHaveCount(
    0,
  );
  await expect(page.getByText("资料依据")).toHaveCount(0);
  await expect(attribution).not.toBeInViewport();
});

test("Campus Map editing keeps the minimal Add facts beside the desktop map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");

  await startOutdoorFacilityAdd(page);

  const sheet = page.getByRole("dialog", { name: "新增设施" });
  const publish = page.getByRole("button", { name: "发布设施" });
  await expect(
    page.getByRole("textbox", { name: "设施名称或编号" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更多信息" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "所属建筑" })).toHaveCount(0);
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

test("Campus Map Add honestly reports an empty Building directory", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "新增设施" }).click();

  await expect(
    page.getByRole("heading", { name: "选择设施位置" }),
  ).toBeVisible();
  await expect(
    page.getByText("暂无可选建筑。你仍可新增室外设施。"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "这是室外设施" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "发布设施" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "建筑" })).toHaveCount(0);
});

test("Campus Map editing supports the minimal Add dirty-close path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/campus-map");

  await startOutdoorFacilityAdd(page);

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
  await expect(page.getByRole("group", { name: "所属建筑" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更改位置" })).toBeVisible();
  await page.getByRole("radio", { name: "洗手间" }).press("Space");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("alertdialog", { name: "放弃未发布的修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByRole("radio", { name: "洗手间" })).toBeChecked();
});
