// ref #646
import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";
import { installFakeCampusMapAmap } from "./helpers/campus-map-amap";

test.beforeEach(async ({ page }) => {
  await installFakeCampusMapAmap(page);
  await loginWithPassword(page, "admin@test.com", "password123");
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/campus-map");

  await page.getByRole("button", { name: "添加地点" }).click();
  const placingSheet = page.getByRole("region", { name: "选择设施位置" });
  const placingSheetBox = await placingSheet.boundingBox();
  expect(placingSheetBox).not.toBeNull();
  expect(placingSheetBox!.height).toBeLessThanOrEqual(336);
  await expect(page.getByText(/WGS84 · 约略/).first()).toHaveCSS(
    "font-weight",
    "600",
  );
  await page.getByRole("button", { name: "使用此位置" }).click();

  const sheet = page.getByRole("region", { name: "添加校内设施" });
  const facilityType = page.getByRole("group", { name: "设施类型" });
  const publish = page.getByRole("button", { name: "发布设施" });
  const attribution = page.locator(".amap-copyright");
  const sheetBox = await sheet.boundingBox();
  const facilityTypeBox = await facilityType.boundingBox();
  const publishBox = await publish.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(facilityTypeBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(facilityTypeBox!.y + facilityTypeBox!.height).toBeLessThanOrEqual(
    publishBox!.y,
  );
  await expect(
    page.getByRole("textbox", { name: "设施名称或编号" }),
  ).toHaveCount(0);
  await expect(page.getByText("资料依据")).toHaveCount(0);
  await expect
    .poll(async () => {
      const currentAttributionBox = await attribution.boundingBox();
      const currentSheetBox = await sheet.boundingBox();
      if (!currentAttributionBox || !currentSheetBox) return false;
      return (
        currentAttributionBox.y + currentAttributionBox.height <=
        currentSheetBox.y
      );
    })
    .toBe(true);
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
