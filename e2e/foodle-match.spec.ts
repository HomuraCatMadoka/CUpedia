import { expect, test, type Page } from "@playwright/test";

const decisionKey = "cupedia:foodle-candidate-decisions:v1";
const matchKey = "cupedia:foodle-match:v1";

const restaurants = {
  first: { id: "sht-mock-meal", name: "新城市茶冰厅" },
  second: { id: "foodle-sht-002", name: "城河米线" },
  third: { id: "foodle-sht-003", name: "瀛月鮨" },
  fourth: { id: "foodle-sht-004", name: "橙路咖啡" },
  taiPoComplete: { id: "tap-mock-meal", name: "墟市鱼蛋粉" },
  taiPoMissing: { id: "foodle-tap-004", name: "铁路旁烘焙室" },
  jordan: { id: "foodle-jor-001", name: "佐敦候选" },
} as const;

async function seedSaved(page: Page, ids: readonly string[]) {
  await page.addInitScript(
    ({ key, restaurantIds }) => {
      Math.random = () => 0.999;
      const byRestaurantId = Object.fromEntries(
        restaurantIds.map((id) => [
          id,
          { decision: "saved", decidedAt: "2026-08-04T00:00:00.000Z" },
        ]),
      );
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: 1, byRestaurantId }),
      );
    },
    { key: decisionKey, restaurantIds: ids },
  );
}

async function openSavedSurface(
  page: Page,
  savedCount: number,
  budget: 10 | 20 | 30 = 30,
) {
  await page.goto("/food-map");
  if (budget !== 30) {
    await page
      .getByRole("group", { name: "通勤时间" })
      .getByRole("button", { name: `${budget} 分钟` })
      .click();
  }
  await expect(
    page.getByRole("button", {
      name: new RegExp(
        `打开 Foodle Match，${budget} 分钟范围，\\d+ 家餐厅`,
        "u",
      ),
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: new RegExp(`打开 Foodle Match，${budget} 分钟范围`, "u"),
    })
    .click();
  await page
    .getByRole("button", { name: `查看想吃候选，${savedCount} 家` })
    .last()
    .click();
  await expect(page.getByRole("heading", { name: "想吃候选" })).toBeVisible();
}

test.describe("#501 Foodle saved-candidate Match", () => {
  test("keeps an empty saved surface free of Match actions", async ({
    page,
  }) => {
    await seedSaved(page, []);
    await openSavedSurface(page, 0);
    await expect(page.getByText("还没有想吃候选")).toBeVisible();
    await expect(page.getByRole("button", { name: /开始 Match/u })).toHaveCount(
      0,
    );
  });

  test("shows a clear empty state when saved restaurants are outside the current scope", async ({
    page,
  }) => {
    await seedSaved(page, [restaurants.jordan.id]);
    await openSavedSurface(page, 1, 10);

    await expect(page.getByText("此范围没有想吃候选")).toBeVisible();
    await expect(page.getByText("范围外 1 家仍保留在想吃候选。")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /开始 Match|从 .* 家想吃候选/u }),
    ).toHaveCount(0);
  });

  test("single candidate opens a result with external actions and no fake round", async ({
    page,
  }) => {
    await seedSaved(page, [restaurants.first.id]);
    await openSavedSurface(page, 1);
    await page
      .getByRole("button", { name: `选择这家：${restaurants.first.name}` })
      .click();

    const dialog = page.getByRole("dialog", { name: "Foodle Match" });
    await expect(
      dialog.getByText("只有这家候选", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByTestId("match-comparison")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "再选一次" })).toHaveCount(
      0,
    );
    const google = dialog.getByRole("link", { name: /Google Maps/u });
    const openRice = dialog.getByRole("link", { name: /OpenRice/u });
    await expect(google).toBeFocused();
    await expect(google).toHaveAttribute("target", "_blank");
    await expect(openRice).toHaveAttribute("target", "_blank");
    await expect(google).toHaveAttribute("rel", /noopener.*noreferrer/u);
    await expect(openRice).toHaveAttribute("rel", /noopener.*noreferrer/u);
    await expect(dialog.getByText(/完成|今晚吃|返回地图/u)).toHaveCount(0);

    await dialog.getByRole("button", { name: "关闭 Match" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "想吃候选" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `选择这家：${restaurants.first.name}` }),
    ).toBeFocused();
  });

  test("keeps champion placement stable, details read-only, then persists and reopens", async ({
    page,
  }) => {
    const ids = [
      restaurants.first.id,
      restaurants.second.id,
      restaurants.third.id,
      restaurants.fourth.id,
    ];
    await seedSaved(page, ids);
    await openSavedSurface(page, 4);
    await page
      .getByRole("button", { name: "从 4 家想吃候选开始 Match" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Foodle Match" });
    await expect(
      dialog.getByText("第 1 / 3 轮", { exact: true }),
    ).toBeVisible();
    let left = dialog.getByTestId("match-left-candidate");
    let right = dialog.getByTestId("match-right-candidate");
    await expect(left).toContainText(restaurants.second.name);
    await expect(right).toContainText(restaurants.first.name);

    const roundBeforeDetails = await dialog
      .getByTestId("match-comparison")
      .textContent();
    await right
      .getByRole("button", {
        name: `下一张${restaurants.first.name}餐厅插画`,
      })
      .click();
    const detailsTrigger = right.getByRole("button", {
      name: `查看 ${restaurants.first.name} 详情`,
    });
    await detailsTrigger.click();
    const details = page.getByRole("dialog", { name: restaurants.first.name });
    await expect(details.getByText("只读详情")).toBeVisible();
    await expect(
      details.getByAltText(`${restaurants.first.name}的餐厅插画，第 2 张`),
    ).toBeVisible();
    await expect(details.getByText(/打卡这家|加入想吃/u)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();
    await expect(detailsTrigger).toBeFocused();
    await expect(dialog.getByTestId("match-comparison")).toHaveText(
      roundBeforeDetails ?? "",
    );

    const firstChoice = dialog.getByRole("button", {
      name: `选择 ${restaurants.first.name}`,
    });
    await firstChoice.focus();
    await firstChoice.press("Enter");
    const choiceGroup = dialog.getByRole("group", { name: "选择餐厅" });
    await expect(choiceGroup).toHaveAttribute("aria-busy", "true");
    for (const button of await choiceGroup.getByRole("button").all()) {
      await expect(button).toBeDisabled();
    }
    left = dialog.getByTestId("match-left-candidate");
    right = dialog.getByTestId("match-right-candidate");
    await expect(left).toContainText(restaurants.third.name);
    await expect(right).toContainText(restaurants.first.name);
    await expect(right).toContainText("上轮胜出");
    await expect(
      dialog.getByRole("button", { name: `选择 ${restaurants.first.name}` }),
    ).toBeFocused();

    await dialog
      .getByRole("button", { name: `选择 ${restaurants.third.name}` })
      .click();
    left = dialog.getByTestId("match-left-candidate");
    right = dialog.getByTestId("match-right-candidate");
    await expect(left).toContainText(restaurants.third.name);
    await expect(right).toContainText(restaurants.fourth.name);
    await expect(left).toContainText("上轮胜出");
    await expect(
      dialog.getByRole("button", { name: /撤回|撤销/u }),
    ).toHaveCount(0);

    await dialog
      .getByRole("button", { name: `选择 ${restaurants.third.name}` })
      .click();
    await expect(dialog.getByTestId("match-result")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "再选一次" }),
    ).toBeVisible();
    const decisionsBeforeReselect = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      decisionKey,
    );
    const originalCandidateIds = await page.evaluate((key) => {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value).result.candidateIds : [];
    }, matchKey);
    await expect
      .poll(async () =>
        page.evaluate((key) => {
          const value = window.localStorage.getItem(key);
          return value ? JSON.parse(value).result.restaurantId : null;
        }, matchKey),
      )
      .toBe(restaurants.third.id);

    await dialog.getByRole("button", { name: "再选一次" }).click();
    await expect(
      dialog.getByText("第 1 / 3 轮", { exact: true }),
    ).toBeVisible();
    const visiblePair = await Promise.all([
      dialog
        .getByTestId("match-left-candidate")
        .getAttribute("data-restaurant-id"),
      dialog
        .getByTestId("match-right-candidate")
        .getAttribute("data-restaurant-id"),
    ]);
    expect(visiblePair.every((id) => originalCandidateIds.includes(id))).toBe(
      true,
    );
    expect(
      await page.evaluate(
        (key) => window.localStorage.getItem(key),
        decisionKey,
      ),
    ).toBe(decisionsBeforeReselect);

    await dialog.getByRole("button", { name: "关闭 Match" }).click();
    await expect(
      page.getByRole("button", { name: "从 4 家想吃候选开始 Match" }),
    ).toBeFocused();
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: /打开 Foodle Match，30 分钟范围/u,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: /打开 Foodle Match，30 分钟范围/u,
      })
      .click();
    await page
      .getByRole("button", { name: "查看想吃候选，4 家" })
      .last()
      .click();
    await page
      .getByRole("button", {
        name: `查看上次 Match：${restaurants.third.name}`,
      })
      .click();
    await expect(dialog.getByText("上次 Match")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "再选一次" })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", {
        name: `查看上次 Match：${restaurants.third.name}`,
      }),
    ).toBeFocused();
  });

  test("keeps missing values as placeholders in the aligned five-row table", async ({
    page,
  }) => {
    await seedSaved(page, [
      restaurants.taiPoComplete.id,
      restaurants.taiPoMissing.id,
    ]);
    await openSavedSurface(page, 2);
    await page
      .getByRole("button", { name: "从 2 家想吃候选开始 Match" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Foodle Match" });
    await expect(dialog.getByText(/第 1 \/ 1 轮/u)).toHaveCount(0);
    await dialog.getByText("详细比较").click();
    const table = dialog.getByRole("table", { name: "餐厅资料比较" });
    await expect(table.getByRole("row")).toHaveCount(6);
    expect(await table.getByText("暂缺").count()).toBeGreaterThanOrEqual(3);
    await dialog
      .getByRole("button", { name: `选择 ${restaurants.taiPoComplete.name}` })
      .click();
    await expect(dialog.getByTestId("match-result")).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: restaurants.taiPoComplete.name }),
    ).toBeVisible();
  });

  test("keeps the full result action hierarchy visible at desktop 720px height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedSaved(page, [
      restaurants.first.id,
      restaurants.second.id,
      restaurants.third.id,
    ]);
    await openSavedSurface(page, 3);
    await page
      .getByRole("button", { name: "从 3 家想吃候选开始 Match" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Foodle Match" });
    await dialog
      .getByRole("button", { name: `选择 ${restaurants.first.name}` })
      .click();
    await dialog
      .getByRole("button", { name: `选择 ${restaurants.first.name}` })
      .click();

    const reselect = dialog.getByRole("button", { name: "再选一次" });
    await expect(reselect).toBeInViewport({ ratio: 1 });
    const bounds = await reselect.boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(704);
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ]) {
    test(`keeps comparison operable at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedSaved(page, [
        restaurants.first.id,
        restaurants.second.id,
        restaurants.third.id,
      ]);
      await openSavedSurface(page, 3);
      await page
        .getByRole("button", { name: "从 3 家想吃候选开始 Match" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Foodle Match" });
      await expect(dialog).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator("main")
            .first()
            .evaluate(
              (element) =>
                (element instanceof HTMLElement && element.inert) ||
                element.getAttribute("aria-hidden") === "true",
            ),
        )
        .toBe(true);
      const geometry = await dialog.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(
        geometry.clientWidth + 1,
      );
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(viewport.width + 1);

      const boxes = await Promise.all(
        [
          "match-left-candidate",
          "match-right-candidate",
          "match-left-name",
          "match-right-name",
          "match-left-heat",
          "match-right-heat",
          "match-left-choice",
          "match-right-choice",
        ].map((testId) => dialog.getByTestId(testId).boundingBox()),
      );
      for (const box of boxes) expect(box).not.toBeNull();
      const [
        leftCard,
        rightCard,
        leftName,
        rightName,
        leftHeat,
        rightHeat,
        leftAction,
        rightAction,
      ] = boxes as Exclude<(typeof boxes)[number], null>[];
      expect(Math.abs(leftCard.y - rightCard.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(leftCard.width - rightCard.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(leftName.y - rightName.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(leftName.height - rightName.height)).toBeLessThanOrEqual(
        1,
      );
      expect(Math.abs(leftHeat.y - rightHeat.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(leftAction.y - rightAction.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(leftAction.width - rightAction.width),
      ).toBeLessThanOrEqual(1);
      expect(rightCard.x).toBeGreaterThan(leftCard.x + leftCard.width);
      expect(rightAction.y + rightAction.height).toBeLessThanOrEqual(
        viewport.height + 1,
      );

      const close = dialog.getByRole("button", { name: "关闭 Match" });
      const lastFocusable = dialog.locator("summary");
      await lastFocusable.focus();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(lastFocusable).toBeFocused();

      const choose = dialog.getByRole("button", {
        name: `选择 ${restaurants.first.name}`,
      });
      await choose.scrollIntoViewIfNeeded();
      if (viewport.width === 390) {
        await choose.focus();
        await choose.press("Enter");
      } else {
        await choose.click();
      }
      await expect(
        dialog.getByText("第 2 / 2 轮", { exact: true }),
      ).toBeVisible();
      if (viewport.width === 390) {
        await expect(
          dialog.getByRole("button", {
            name: `选择 ${restaurants.first.name}`,
          }),
        ).toBeFocused();
      }

      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          page.evaluate(() => document.activeElement !== document.body),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("heading", { name: "想吃候选" }),
      ).toBeVisible();
    });
  }
});
