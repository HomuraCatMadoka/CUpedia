import { expect, test } from "@playwright/test";

test.describe("#500 Foodle restaurant discovery", () => {
  test("builds and revises a saved candidate from the commute map", async ({
    page,
  }) => {
    const response = await page.goto("/food-map");
    expect(response?.status()).toBe(200);

    const commuteScope = page.getByRole("group", { name: "通勤时间" });
    await commuteScope
      .getByRole("button", { name: "10 分钟", exact: true })
      .click();
    await expect(
      commuteScope.getByRole("button", { name: "10 分钟", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    const shaTin = page.getByRole("button", {
      name: "沙田，7 分钟，已有餐厅候选",
    });
    await shaTin.click();
    await expect(
      page.getByRole("heading", { name: "沙田站附近" }),
    ).toBeVisible();
    await expect(
      page.getByText("10 分钟范围 · 港铁 7 分钟 · 4 家餐厅"),
    ).toBeVisible();

    await page.getByRole("button", { name: "详情" }).click();
    await expect(
      page.getByRole("dialog", { name: "新城市茶冰厅" }),
    ).toBeVisible();
    await expect(page.getByText("想吃 0", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "想吃", exact: true }).click();
    await expect(page.getByRole("heading", { name: "城河米线" })).toBeVisible();
    await expect(page.getByText("想吃 1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "上一家餐厅" }).click();
    await expect(page.getByLabel("当前状态：已想吃")).toBeVisible();

    await page.getByRole("button", { name: "略过", exact: true }).click();
    await expect(page.getByText("想吃 0", { exact: true })).toBeVisible();
    await expect(page.getByText("略过 1", { exact: true })).toBeVisible();

    await commuteScope
      .getByRole("button", { name: "20 分钟", exact: true })
      .click();
    await expect(
      page.getByText("20 分钟范围 · 港铁 7 分钟 · 4 家餐厅"),
    ).toBeVisible();
    await page.getByRole("button", { name: "上一家餐厅" }).click();
    await expect(page.getByLabel("当前状态：已略过")).toBeVisible();

    await shaTin.click();
    await expect(
      page.getByRole("heading", { name: "从地铁图选择一站" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "沙田站附近" })).toHaveCount(
      0,
    );
  });

  test("maps horizontal drags to pass and save while vertical movement cancels", async ({
    page,
  }) => {
    await page.goto("/food-map");
    await page
      .getByRole("button", { name: "沙田，7 分钟，已有餐厅候选" })
      .click();

    const card = page.getByTestId("restaurant-card");
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 110, centerY + 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole("heading", { name: "城河米线" })).toBeVisible();
    await expect(page.getByText("略过 1", { exact: true })).toBeVisible();

    const secondBox = await card.boundingBox();
    expect(secondBox).not.toBeNull();
    if (!secondBox) return;
    const secondX = secondBox.x + secondBox.width / 2;
    const secondY = secondBox.y + secondBox.height / 2;

    await page.mouse.move(secondX, secondY);
    await page.mouse.down();
    await page.mouse.move(secondX + 110, secondY + 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole("heading", { name: "瀛月鮨" })).toBeVisible();
    await expect(page.getByText("想吃 1", { exact: true })).toBeVisible();

    const thirdBox = await card.boundingBox();
    expect(thirdBox).not.toBeNull();
    if (!thirdBox) return;
    const thirdX = thirdBox.x + thirdBox.width / 2;
    const thirdY = thirdBox.y + thirdBox.height / 2;

    await page.mouse.move(thirdX, thirdY);
    await page.mouse.down();
    await page.mouse.move(thirdX + 20, thirdY + 100, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole("heading", { name: "瀛月鮨" })).toBeVisible();
    await expect(page.getByText("未看 2", { exact: true })).toBeVisible();
  });

  test("keeps the 390px selected-station flow free of horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/food-map");
    await page
      .getByRole("button", { name: "沙田，7 分钟，已有餐厅候选" })
      .click();

    await expect(
      page.getByRole("heading", { name: "沙田站附近" }),
    ).toBeVisible();
    await expect(page.getByTestId("restaurant-card")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth ===
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});
