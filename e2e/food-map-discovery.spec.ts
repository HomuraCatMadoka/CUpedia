import { expect, test } from "@playwright/test";

test.describe("#500 Foodle station restaurant maps", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test("moves from the commute map to an independent station explorer", async ({
    page,
  }) => {
    const response = await page.goto("/food-map");
    expect(response?.status()).toBe(200);

    const shaTin = page.getByRole("button", {
      name: "沙田，7 分钟，已有餐厅候选",
    });
    await shaTin.click();
    await expect(
      page.getByRole("heading", { name: "沙田站附近餐厅" }),
    ).toBeVisible();
    await expect(page.getByText("500m", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "略过", exact: true }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "打开 沙田餐厅地图" }).click();
    await expect(page).toHaveURL(/\/food-map\/stations\/sht$/u);
    await expect(
      page.getByRole("heading", { name: "沙田站附近" }),
    ).toBeVisible();
    await expect(page.getByText("500 米 · 4 家餐厅")).toBeVisible();
  });

  test("filters, opens details and records an immutable daily visit", async ({
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

  test("uses map/list and a bottom detail sheet on mobile without overflow", async ({
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
