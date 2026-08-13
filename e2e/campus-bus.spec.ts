import { expect, test } from "@playwright/test";

// ref #582

const MOBILE_VIEWPORT = { width: 393, height: 852 };
const IN_SERVICE_HONG_KONG_TIME = new Date("2026-08-10T00:00:00.000Z");

test.describe("campus bus catalog layout", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("shows the testing entry without enabling model operations", async ({
    page,
  }) => {
    const response = await page.goto("/campus-bus");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("link", { name: "CU Bus · 測試中" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "模型實驗室" })).toHaveCount(0);
  });

  test("fills the available main shell width", async ({ page }) => {
    const response = await page.goto("/campus-bus");
    expect(response?.status()).toBe(200);

    const shell = await page.locator("#main-content").boundingBox();
    const catalog = await page.locator("#main-content > main").boundingBox();

    expect(shell).not.toBeNull();
    expect(catalog).not.toBeNull();
    expect(catalog!.width).toBeGreaterThanOrEqual(shell!.width - 1);
  });
});

test.describe("campus bus model lab rollout", () => {
  test("keeps the lab unavailable during feedback-only rollout", async ({
    page,
  }) => {
    await page.goto("/campus-bus/lab");

    await expect(page.getByText("404")).toBeVisible();
  });
});

test.describe("campus bus Route 2 mobile journey", () => {
  test.use({ viewport: MOBILE_VIEWPORT, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: IN_SERVICE_HONG_KONG_TIME });
    const response = await page.goto("/campus-bus/2");
    expect(response?.status()).toBe(200);

    // The server supplies its own initial clock. Advance the client interval once
    // so arrival assertions use the fixed Hong Kong service time above.
    await expect(page.getByRole("button", { name: "我的位置" })).toBeVisible();
    await page.clock.fastForward("00:00:31");
  });

  test("renders the default stop, route map, and timetable", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "2 新聯線", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByText("今日 07:45-18:45")).toBeVisible();
    await expect(page.getByText("測試預計 · 非實時車輛位置")).toBeVisible();
    await expect(
      page.getByRole("region", { name: /顯示 2 號線/ }),
    ).toBeVisible();

    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    const nearbyStop = stops.getByRole("button", {
      name: /善衡書院 S\.H\. Ho College/,
    });
    await expect(nearbyStop).toHaveAttribute("aria-expanded", "true");
    const nextArrival = stops.getByText("下一班", { exact: true });
    await expect(nextArrival).toBeVisible();
    await expect(nextArrival).toBeInViewport({ ratio: 0.5 });
    await expect(page.getByText("所有中途站時間均為公開資料推算")).toHaveCount(
      0,
    );
  });

  test("uses the reviewed LandsD basemap instead of the blocked OSM tile service", async ({
    page,
  }) => {
    const tileRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("tile.openstreetmap.org") ||
        url.includes("mapapi.geodata.gov.hk")
      ) {
        tileRequests.push(url);
      }
    });

    await page.reload();
    await expect(page.getByRole("button", { name: "我的位置" })).toBeVisible();
    await expect
      .poll(() =>
        tileRequests.some((url) => url.includes("mapapi.geodata.gov.hk")),
      )
      .toBe(true);

    expect(
      tileRequests.some((url) => url.includes("tile.openstreetmap.org")),
    ).toBe(false);
    await expect(
      page.getByRole("link", {
        name: "地政總署 · Map from Lands Department",
      }),
    ).toBeVisible();
  });

  test("keeps the map usable when one raster tile fails", async ({ page }) => {
    let failedOneTile = false;
    await page.route("**/gs/api/v1.0.0/xyz/**", async (route) => {
      if (!failedOneTile) {
        failedOneTile = true;
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.reload();
    await expect(page.getByRole("button", { name: "我的位置" })).toBeVisible();
    await expect(page.getByText("地圖暫時無法載入")).toHaveCount(0);
  });

  test("selecting a partial-service stop keeps the map and stop board synchronized", async ({
    page,
  }) => {
    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    const shawStop = stops.getByRole("button", {
      name: /邵逸夫堂 Sir Run Run Shaw Hall/,
    });

    await expect(shawStop.getByText("部分班次")).toBeVisible();
    await shawStop.click();
    await expect(shawStop).toHaveAttribute("aria-expanded", "true");
    await expect(
      stops.getByText("另有 08:15、08:30 起點班次不停靠本站"),
    ).toBeVisible();

    const map = page.getByRole("region", { name: "2 號線地圖" });
    await expect(
      map.getByRole("button", { name: "3. 邵逸夫堂" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("asks the user to choose between nearby stops on opposite sides of the road", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 22.418023378635656,
      longitude: 114.20974999666214,
    });
    await page.getByRole("button", { name: "我的位置" }).click();

    const choice = page.getByRole("complementary", {
      name: "附近有兩個候車站，請選擇所在一側",
    });
    await expect(choice).toBeVisible();
    await expect(
      choice.getByRole("button", { name: "善衡書院" }),
    ).toBeVisible();
    await expect(
      choice.getByRole("button", { name: "大學體育中心" }),
    ).toBeVisible();

    await choice.getByRole("button", { name: "大學體育中心" }).click();
    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    const sportsCentre = stops.getByRole("button", {
      name: /大學體育中心 Univ\. Sports Centre/,
    });
    await expect(sportsCentre).toHaveAttribute("aria-expanded", "true");
    await expect(sportsCentre.getByText("你在附近")).toBeVisible();
  });

  test("adjusts the reported minute and acknowledges one submission once", async ({
    page,
  }) => {
    test.slow();
    await page.clock.setSystemTime(new Date());
    await page.clock.fastForward("00:00:31");

    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    await stops
      .getByRole("button", {
        name: "預測不準？提交實時到站時間改進預測",
      })
      .click();

    const dialog = page.getByRole("dialog", { name: "提交到站時間" });
    await expect(dialog.getByText("2 新聯線", { exact: true })).toBeVisible();
    await expect(dialog.getByText("善衡書院", { exact: true })).toBeVisible();
    await expect(dialog.getByText("現在", { exact: true })).toBeVisible();
    const addMinute = dialog.getByRole("button", {
      name: "到站時間加一分鐘",
    });
    await expect(addMinute).toBeEnabled();

    await addMinute.click();
    await addMinute.click();
    await expect(dialog.getByText("2 分鐘後", { exact: true })).toBeVisible();
    await expect(addMinute).toBeDisabled();

    await dialog.getByRole("button", { name: "到站時間減一分鐘" }).click();
    await expect(dialog.getByText("1 分鐘後", { exact: true })).toBeVisible();
    const browserNow = await page.evaluate(() => Date.now());

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/campus-bus/arrival-observations") &&
        response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "提交", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const submitted = response.request().postDataJSON() as {
      observedArrivalAt: string;
    };
    const submittedOffset =
      new Date(submitted.observedArrivalAt).getTime() - browserNow;
    expect(submittedOffset).toBeGreaterThanOrEqual(59_000);
    expect(submittedOffset).toBeLessThanOrEqual(60_000);
    await expect(dialog).toBeHidden();

    const acknowledgement = page.getByText("謝謝，你的到站時間已提交。");
    await expect(acknowledgement).toHaveCount(1);
    await expect(acknowledgement).toBeVisible();
  });

  test("explains when anonymous arrival feedback is submitted too frequently", async ({
    page,
  }) => {
    await page.route(
      "**/api/campus-bus/arrival-observations",
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({ error: "RATE_LIMIT_EXCEEDED" }),
          contentType: "application/json",
          headers: { "Retry-After": "600" },
          status: 429,
        });
      },
    );

    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    await stops
      .getByRole("button", {
        name: "預測不準？提交實時到站時間改進預測",
      })
      .click();
    await page
      .getByRole("dialog", { name: "提交到站時間" })
      .getByRole("button", { name: "提交", exact: true })
      .click();

    await expect(page.getByText("提交太頻密，請稍後再試。")).toBeVisible();
  });
});

test.describe("campus bus reviewed route catalog", () => {
  test.use({ viewport: MOBILE_VIEWPORT, isMobile: true, hasTouch: true });

  test("keeps manual Boarding place selection usable after location is denied", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(
            _success: PositionCallback,
            error: PositionErrorCallback,
          ) {
            error({
              code: 1,
              message: "Permission denied by test",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          },
        },
      });
    });
    const response = await page.goto("/campus-bus");
    expect(response?.status()).toBe(200);

    await page.getByRole("button", { name: "使用我的位置" }).click();
    await expect(
      page.getByText("未允許使用位置。請手動選擇，或在瀏覽器設定中重新允許。"),
    ).toBeVisible();
    await page.getByRole("button", { name: "手動選擇" }).click();
    await page
      .getByRole("dialog", { name: "選擇乘車地點" })
      .getByRole("button", { name: /大學站 Univ\. Station/ })
      .click();

    await expect(
      page.getByRole("heading", { name: "大學站", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /1A 本部線/ }).first(),
    ).toBeVisible();
  });

  test("shows the first departure instead of a multi-hour countdown before service", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-08-10T17:28:00.000Z") });
    const response = await page.goto("/campus-bus/1a");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("button", { name: "我的位置" })).toBeVisible();
    await page.clock.fastForward("00:00:31");

    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    const universityStation = stops.getByRole("button", {
      name: "1. 大學站 Univ. Station",
    });

    await expect(universityStation).toHaveAttribute("aria-expanded", "true");
    await expect(stops.getByText("今日 07:40 開始")).toBeVisible();
    await expect(stops.getByText("372 分鐘", { exact: true })).toHaveCount(0);
    await expect(
      stops.getByRole("button", {
        name: "預測不準？提交實時到站時間改進預測",
      }),
    ).toBeInViewport();
  });

  test("lists the reviewed routes and opens Route 3", async ({ page }) => {
    test.slow();
    await page.clock.install({ time: IN_SERVICE_HONG_KONG_TIME });
    const response = await page.goto("/campus-bus");
    expect(response?.status()).toBe(200);
    await page.clock.fastForward("00:00:31");

    await expect(
      page.getByRole("heading", { name: "中大校巴", level: 1 }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "全部路線" }).click();
    await expect(
      page.getByRole("heading", { name: "現在可乘", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "其他路線", level: 2 }),
    ).toBeVisible();
    for (const route of [
      "1A 本部線",
      "1B 本部線",
      "2 新聯線",
      "3 逸夫線",
      "4 環迴線",
      "5 上行線",
      "6A 下行線 (敬文)",
      "6B 下行線 (新聯)",
      "7 下行線 (逸夫)",
      "N 晚間線",
      "H 假日線",
    ]) {
      await expect(page.getByRole("link", { name: route })).toBeVisible();
    }

    await page.getByRole("link", { name: /3 逸夫線/ }).click();
    await expect(page).toHaveURL(/\/campus-bus\/3$/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "3 逸夫線", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("今日 09:00-18:40")).toBeVisible();
    await expect(
      page.getByRole("region", { name: /顯示 3 號線/ }),
    ).toBeVisible();
  });

  test("offers all routes when no bus is currently running", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-08-09T17:00:00.000Z") });
    const response = await page.goto("/campus-bus");
    expect(response?.status()).toBe(200);
    await page.clock.fastForward("00:00:31");
    await page.getByRole("tab", { name: "全部路線" }).click();

    await expect(
      page.getByText("目前沒有行駛中的校巴，其他今日路線仍可在下方查看。"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "其他路線", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /1A 本部線/ })).toBeVisible();
  });

  test("shows Route 5 as unavailable during the official reading week", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-03-02T01:18:00.000Z") });
    const response = await page.goto("/campus-bus/5");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "5 上行線", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("今日不服務", { exact: true })).toBeVisible();
    await expect(page.getByText("今日不提供 5 線服務").first()).toBeVisible();
  });

  test("cycles colocated loop occurrences from one map marker", async ({
    page,
  }) => {
    await page.goto("/campus-bus/1b");
    await expect(page.getByRole("button", { name: "我的位置" })).toBeVisible();

    const map = page.getByRole("region", { name: "1B 號線地圖" });
    const sharedTerminus = map.getByRole("button", {
      name: "1. 大學站；8. 大學站",
    });
    await expect(sharedTerminus).toBeVisible();
    await sharedTerminus.click();

    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    await expect(
      stops.getByRole("button", { name: "8. 大學站 Univ. Station" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("labels N route conditional PGH1 stops without calling them universal next stops", async ({
    page,
  }) => {
    const response = await page.goto("/campus-bus/n");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "N 晚間線", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("晚間校園環線 · 部分班次經研究生宿舍一座"),
    ).toBeVisible();
    const stops = page.locator(
      'section[aria-labelledby="campus-route-stops-heading"]',
    );
    await expect(
      stops.getByRole("button", {
        name: "2. 研究生宿舍一座 Postgraduate Hall 1 部分班次",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "N 號線地圖" }),
    ).toBeVisible();
  });
});
