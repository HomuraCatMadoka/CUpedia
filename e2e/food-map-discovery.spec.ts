import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { loginWithPassword } from "./helpers/auth";

const FOODLE_TEST_USER = "user@test.com";

async function resetFoodleTestUser() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `delete from foodle_user_states
        where user_id = (select id from users where email = $1)`,
      [FOODLE_TEST_USER],
    );
  } finally {
    await client.end();
  }
}

async function openFoodle(page: Page) {
  const entry = page.getByRole("button", { name: /打开 Foodle Match，/u });
  await expect(entry).toBeEnabled();
  await entry.click();
  await expect(
    page.getByRole("region", { name: "Foodle Match 餐厅发现" }),
  ).toBeVisible();
}

async function dragCard(
  page: Page,
  card: Locator,
  deltaX: number,
  deltaY: number,
) {
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 6 });
  await page.mouse.up();
}

test.describe("#500 Foodle restaurant discovery", () => {
  test.beforeEach(async ({ page }) => {
    await resetFoodleTestUser();
    await loginWithPassword(page, FOODLE_TEST_USER, "password123");
  });

  test.afterEach(async () => {
    await resetFoodleTestUser();
  });

  test("enters an independent scoped deck and keeps saved candidates", async ({
    page,
  }) => {
    const response = await page.goto("/food-map");
    expect(response?.status()).toBe(200);

    const commuteScope = page.getByRole("group", { name: "通勤时间" });
    await commuteScope
      .getByRole("button", { name: "20 分钟", exact: true })
      .click();
    await page
      .getByRole("button", { name: "沙田，沙田区，7 分钟，已有餐厅候选" })
      .click();

    await expect(
      page.getByRole("button", {
        name: "打开 Foodle Match，沙田站 · 20 分钟范围，4 家餐厅",
      }),
    ).toBeVisible();
    await openFoodle(page);
    await expect(
      page.getByRole("heading", { name: "沙田站 · 20 分钟范围" }),
    ).toBeVisible();
    await expect(page.getByText("本轮 4 家 · 港铁 7 分钟")).toBeVisible();
    await expect(page.getByText("1 / 4", { exact: true })).toBeVisible();

    const backgroundIsInert = await page
      .locator('[role="group"][aria-label="通勤时间"]')
      .evaluate((element) => {
        let current: HTMLElement | null = element as HTMLElement;
        while (current && current !== document.body) {
          if (current.inert) return true;
          current = current.parentElement;
        }
        return false;
      });
    expect(backgroundIsInert).toBe(true);
    const back = page.getByRole("button", { name: "返回通勤地图" });
    const save = page.getByRole("button", { name: "想吃", exact: true });
    await save.focus();
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(save).toBeFocused();

    await page.getByRole("button", { name: "查看餐厅详情" }).click();
    await expect(
      page.getByRole("dialog", { name: "新城市茶冰厅" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "在 OpenRice 查看" }),
    ).toHaveAttribute("target", "_blank");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "想吃", exact: true }).click();
    await expect(page.getByText("2 / 4", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "查看想吃候选，1 家" }),
    ).toBeVisible();

    const matchSurface = page.getByTestId("foodle-match-surface");
    const surfaceBox = await matchSurface.boundingBox();
    expect(surfaceBox?.x).toBe(0);
    expect(surfaceBox?.y).toBe(0);
    expect(surfaceBox?.width).toBe(1280);
    await expect(
      page.getByRole("heading", { name: "沙田站 · 20 分钟范围" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "查看想吃候选，1 家" }).click();
    await expect(page.getByRole("heading", { name: "想吃候选" })).toBeVisible();
    await expect(page.getByText("新城市茶冰厅", { exact: true })).toBeVisible();
    await expect(page.getByText("此范围 1 家 · 共 1 家")).toBeVisible();
  });

  test("maps horizontal drags and visible buttons to the same decisions", async ({
    page,
  }) => {
    await page.goto("/food-map");
    await openFoodle(page);

    const card = page.getByTestId("restaurant-card");
    const firstName = await card
      .getByRole("heading", { level: 3 })
      .textContent();
    await dragCard(page, card, -110, 2);
    await expect(card.getByRole("heading", { level: 3 })).not.toHaveText(
      firstName ?? "",
    );

    const secondName = await card
      .getByRole("heading", { level: 3 })
      .textContent();
    await dragCard(page, card, 110, 2);
    await expect(
      page.getByRole("button", { name: "查看想吃候选，1 家" }),
    ).toBeVisible();

    const thirdName = await card
      .getByRole("heading", { level: 3 })
      .textContent();
    await dragCard(page, card, 20, 110);
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      thirdName ?? "",
    );

    await page.getByRole("button", { name: "略过", exact: true }).click();
    await expect(card.getByRole("heading", { level: 3 })).not.toHaveText(
      thirdName ?? "",
    );
    expect(secondName).not.toBe(firstName);
  });

  test("handles gallery, missing media, missing source URLs and missing facts", async ({
    page,
  }) => {
    await page.goto("/food-map");
    await page
      .getByRole("button", { name: "沙田，沙田区，7 分钟，已有餐厅候选" })
      .click();
    await openFoodle(page);
    await expect(
      page.getByRole("button", { name: "下一张餐厅插画" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "下一张餐厅插画" }).click();
    await expect(page.getByAltText(/第 2 张/u)).toBeVisible();

    await page.getByRole("button", { name: "返回通勤地图" }).click();
    await page
      .getByRole("button", {
        name: "九龙塘，九龙城区，14 分钟，已有餐厅候选",
      })
      .click();
    await openFoodle(page);
    await expect(
      page.getByTestId("restaurant-illustration-fallback"),
    ).toBeVisible();
    await page.getByRole("button", { name: "查看餐厅详情" }).click();
    await expect(page.getByText("OpenRice 链接资料暂缺")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "在 OpenRice 查看" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "返回通勤地图" }).click();
    await page
      .getByRole("button", { name: "大埔墟，大埔区，7 分钟，已有餐厅候选" })
      .click();
    await openFoodle(page);
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole("button", { name: "略过", exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { name: "铁路旁烘焙室" }),
    ).toBeVisible();
    await expect(page.getByText("菜系资料暂缺")).toBeVisible();
    await expect(
      page.getByText("资料暂缺", { exact: true }).first(),
    ).toBeVisible();
  });

  test("keeps the complete map and deck operable at a 390px viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/food-map");
    await page
      .getByRole("button", { name: "沙田，沙田区，7 分钟，已有餐厅候选" })
      .click();

    const jordan = page.getByRole("button", {
      name: "佐敦，油尖旺区，30 分钟，已有餐厅候选",
    });
    await expect(jordan).toBeAttached();
    expect(
      await jordan.evaluate((element) => getComputedStyle(element).visibility),
    ).toBe("visible");

    await openFoodle(page);
    await expect(page.getByTestId("restaurant-card")).toBeVisible();
    const surfaceBox = await page
      .getByTestId("foodle-match-surface")
      .boundingBox();
    expect(surfaceBox?.x).toBe(0);
    expect(surfaceBox?.y).toBe(0);
    expect(surfaceBox?.width).toBe(390);
    for (const name of ["略过", "想吃"]) {
      const box = await page
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth ===
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});

test.describe("Foodle station restaurant maps", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test("opens a station explorer from the commute map", async ({ page }) => {
    const response = await page.goto("/food-map");
    expect(response?.status()).toBe(200);

    await page
      .getByRole("button", {
        name: "沙田，沙田区，7 分钟，已有餐厅候选",
      })
      .click();
    const stationMapLink = page.getByRole("link", {
      name: "打开 沙田餐厅地图",
    });
    await expect(stationMapLink).toBeVisible();
    await stationMapLink.click();

    await expect(page).toHaveURL(/\/food-map\/stations\/sht$/u);
    await expect(
      page.getByRole("heading", { name: "沙田站附近" }),
    ).toBeVisible();
    await expect(page.getByText("500 米 · 4 家餐厅")).toBeVisible();
    await expect(page.locator('[data-map-state="ready"]')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("地图暂时无法载入")).toHaveCount(0);
  });

  test("filters, synchronizes selection and records one daily visit", async ({
    page,
  }) => {
    await page.goto("/food-map/stations/sht");

    await page.getByPlaceholder("搜索餐厅或菜系").fill("米线");
    await expect(page.getByText("1 个结果")).toBeVisible();
    await expect(page.getByRole("button", { name: /城河米线/u })).toBeVisible();
    await page.getByPlaceholder("搜索餐厅或菜系").clear();

    const newCityListItem = page.getByRole("button", {
      name: /^新城市茶冰厅 港式/u,
    });
    const newCityMarker = page.locator('[data-foodle-marker="sht-mock-meal"]');
    await newCityListItem.click();
    await expect(
      page.getByRole("complementary", { name: "新城市茶冰厅详情" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "新城市茶冰厅", level: 2 }),
    ).toBeFocused();
    await expect(newCityMarker).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "记录今天到访" }).click();

    const confirmation = page.getByRole("dialog", { name: "记录今天到访" });
    await expect(confirmation).toContainText("不可撤销或删除");
    await confirmation.getByRole("button", { name: "确认" }).click();
    await expect(
      page.getByRole("button", { name: "今天已记录" }),
    ).toBeDisabled();
    await expect(page.getByText("我的到访 1 次")).toBeVisible();
    await expect(page.getByText("累计 59 次打卡")).toBeVisible();
    await expect(newCityMarker).toHaveAccessibleName(
      "新城市茶冰厅，累计打卡 59 次",
    );

    await page.getByRole("button", { name: "返回餐厅列表" }).click();
    await expect(newCityListItem).toBeFocused();
    await expect(newCityListItem).toContainText("59 次");

    const noodleListItem = page.getByRole("button", {
      name: /^城河米线 滇菜/u,
    });
    await noodleListItem.click();
    await expect(newCityMarker).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.locator('[data-foodle-marker="foodle-sht-002"]'),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByPlaceholder("搜索餐厅或菜系").fill("寿司");
    await expect(
      page.getByRole("complementary", { name: "城河米线详情" }),
    ).toHaveCount(0);
    await expect(page.getByText("1 个结果")).toBeVisible();
  });

  test("uses mobile filters, list mode and a bottom detail sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/food-map/stations/tap");

    await page.getByRole("button", { name: "筛选餐厅" }).click();
    const filters = page.getByRole("dialog", { name: "筛选餐厅" });
    await expect(filters).toBeVisible();
    await filters.getByRole("button", { name: "粤菜", exact: true }).click();
    await expect(filters.getByText("当前有 1 家符合条件")).toBeVisible();
    await filters.getByRole("button", { name: "重置" }).click();
    await expect(filters.getByText("当前有 4 家符合条件")).toBeVisible();
    await filters.getByRole("button", { name: "查看 4 家餐厅" }).click();
    await expect(filters).toBeHidden();

    await page.getByRole("button", { name: "列表", exact: true }).click();
    await expect(page.getByText("4 个结果")).toBeVisible();
    await page.getByRole("button", { name: /墟市鱼蛋粉/u }).click();

    const details = page.getByRole("dialog", { name: "墟市鱼蛋粉" });
    await expect(details).toBeVisible();
    await expect(
      details.getByRole("link", { name: "在 Google Maps 打开" }),
    ).toHaveAttribute("href", /google\.com\/maps\/dir/u);
    await expect(
      page.evaluate(
        () =>
          document.documentElement.scrollWidth ===
          document.documentElement.clientWidth,
      ),
    ).resolves.toBe(true);

    await details.getByRole("button", { name: "关闭餐厅详情" }).click();
    await expect(details).toBeHidden();
  });
});
