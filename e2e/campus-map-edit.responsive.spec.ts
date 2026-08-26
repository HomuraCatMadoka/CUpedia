// ref #646
import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";

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

  await loginWithPassword(page, "user@test.com", "password123");
});

test("Campus Map and its AMap config require authentication", async ({
  browser,
}) => {
  const anonymous = await browser.newPage();
  const configResponse = await anonymous.request.get("/api/campus-map/config");
  expect(configResponse.status()).toBe(401);

  await anonymous.goto("/prototype/campus-map?v=1&task=create&anchor=map");
  await expect(anonymous).toHaveURL(/\/login\?/);
  const callbackUrl = new URL(anonymous.url()).searchParams.get("callbackUrl");
  expect(callbackUrl).toBe("/prototype/campus-map?v=1&task=create&anchor=map");
  await anonymous.close();
});

test("Campus Map editing keeps its primary action inside a 390px-high viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 390 });
  await page.goto("/prototype/campus-map");

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
  await page.goto("/prototype/campus-map");

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
  await page.goto("/prototype/campus-map");

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
