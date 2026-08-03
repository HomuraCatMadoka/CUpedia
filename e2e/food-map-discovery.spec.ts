import { expect, test, type Locator, type Page } from "@playwright/test";

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
