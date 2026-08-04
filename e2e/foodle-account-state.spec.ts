import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { Client } from "pg";

import { loginWithPassword } from "./helpers/auth";

const USER_EMAIL = "user@test.com";
const USER_PASSWORD = "password123";
const decisionKey = "cupedia:foodle-candidate-decisions:v1";
const matchKey = "cupedia:foodle-match:v1";
const pendingKey = "cupedia:foodle-pending-intent:v1";

async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query<T>(text, values);
  } finally {
    await client.end();
  }
}

async function resetPersonalState() {
  await query(
    `delete from foodle_user_states
      where user_id = (select id from users where email = $1)`,
    [USER_EMAIL],
  );
}

async function savedDecision(restaurantId: string) {
  const result = await query<{ decision: string | null }>(
    `select decisions->'byRestaurantId'->$2->>'decision' as decision
       from foodle_user_states f
       join users u on u.id = f.user_id
      where u.email = $1`,
    [USER_EMAIL, restaurantId],
  );
  return result.rows[0]?.decision ?? null;
}

async function seedSavedAccountState(restaurantIds: readonly string[]) {
  const byRestaurantId = Object.fromEntries(
    restaurantIds.map((restaurantId) => [
      restaurantId,
      { decision: "saved", decidedAt: "2026-08-04T00:00:00.000Z" },
    ]),
  );
  await query(
    `insert into foodle_user_states (user_id, decisions, match_result, updated_at)
     select id, $2::jsonb, null, now() from users where email = $1
     on conflict (user_id) do update
       set decisions = excluded.decisions,
           match_result = null,
           updated_at = now()`,
    [USER_EMAIL, JSON.stringify({ version: 1, byRestaurantId })],
  );
}

async function openShaTin(page: Page, budget: 20 | 30 = 20) {
  if (budget !== 30) {
    await page
      .getByRole("group", { name: "通勤时间" })
      .getByRole("button", { name: `${budget} 分钟` })
      .click();
  }
  await page
    .getByRole("button", {
      name: "沙田，沙田区，7 分钟，已有餐厅候选",
    })
    .click();
  await page
    .getByRole("button", {
      name: new RegExp(
        `打开 Foodle Match，沙田站 · ${budget} 分钟范围，4 家餐厅`,
        "u",
      ),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "新城市茶冰厅" }),
  ).toBeVisible();
}

async function tap(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
}

async function mobilePage(browser: Browser) {
  const baseURL = test.info().project.use.baseURL as string;
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  return { context, page: await context.newPage() };
}

test.beforeEach(async () => {
  await resetPersonalState();
});

test.afterEach(async () => {
  await resetPersonalState();
});

test.describe("#502 Foodle account state", () => {
  test("restores a 390px touch decision after the real login interruption", async ({
    browser,
  }) => {
    const { context, page } = await mobilePage(browser);
    try {
      await page.goto("/food-map");
      await openShaTin(page);

      const save = page.getByRole("button", { name: "想吃", exact: true });
      await tap(page, save);
      const loginDialog = page.getByRole("dialog", { name: "登录后继续" });
      await expect(loginDialog.getByText(/尚未提交/u)).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "新城市茶冰厅" }),
      ).toBeHidden();
      await loginDialog.getByRole("link", { name: "登录并继续" }).click();

      await expect(page).toHaveURL(/\/login\?next=%2Ffood-map$/u);
      await page.waitForLoadState("load");
      await expect(
        page.getByRole("heading", { name: "登录后继续" }),
      ).toBeVisible();
      await expect(page.getByText("完成后回到刚才的餐厅")).toBeVisible();
      const email = page.getByLabel("CUHK 邮箱");
      const submit = page.getByRole("button", { name: "登录", exact: true });
      for (const control of [
        page.getByRole("tab", { name: "密码登录" }),
        email,
        page.getByLabel("密码", { exact: true }),
        submit,
      ]) {
        const bounds = await control.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      expect(
        await submit.evaluate((element) => ({
          backgroundColor: getComputedStyle(element).backgroundColor,
          primary: getComputedStyle(element).getPropertyValue("--primary"),
        })),
      ).toEqual({
        backgroundColor: "rgb(103, 45, 126)",
        primary: "#672d7e",
      });
      await email.fill(USER_EMAIL);
      await expect(email).toHaveValue(USER_EMAIL);
      await page.getByLabel("密码", { exact: true }).fill(USER_PASSWORD);
      await page.getByRole("button", { name: "登录", exact: true }).click();

      await expect(page).toHaveURL(/\/food-map$/u);
      await expect(
        page.getByRole("heading", { name: "沙田站 · 20 分钟范围" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "新城市茶冰厅" }),
      ).toBeVisible();
      expect(
        await page.evaluate((key) => localStorage.getItem(key), pendingKey),
      ).toBeNull();
      expect(await savedDecision("sht-mock-meal")).toBeNull();

      await tap(page, page.getByRole("button", { name: "想吃", exact: true }));
      await expect.poll(() => savedDecision("sht-mock-meal")).toBe("saved");
      expect(
        await page.evaluate((key) => localStorage.getItem(key), decisionKey),
      ).toBeNull();
      expect(
        await page.evaluate((key) => localStorage.getItem(key), matchKey),
      ).toBeNull();
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test("keeps account choices across independent browser contexts", async ({
    browser,
    page,
  }) => {
    await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/food-map");
    await openShaTin(page, 30);
    await page.getByRole("button", { name: "想吃", exact: true }).click();
    await expect.poll(() => savedDecision("sht-mock-meal")).toBe("saved");

    const baseURL = test.info().project.use.baseURL as string;
    const secondContext = await browser.newContext({ baseURL });
    const secondPage = await secondContext.newPage();
    try {
      await loginWithPassword(secondPage, USER_EMAIL, USER_PASSWORD);
      await secondPage.goto("/food-map");
      await expect(
        secondPage.getByText("想吃 1", { exact: true }),
      ).toBeVisible();
    } finally {
      await secondContext.close();
    }
  });

  test("completes and restores Match through real 390px touch interactions", async ({
    browser,
  }) => {
    await seedSavedAccountState([
      "sht-mock-meal",
      "foodle-sht-002",
      "foodle-sht-003",
    ]);
    const { context, page } = await mobilePage(browser);
    try {
      await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
      await page.goto("/food-map");
      await page.evaluate(() => {
        Math.random = () => 0.999;
      });

      await tap(
        page,
        page.getByRole("button", {
          name: /打开 Foodle Match，30 分钟范围，\d+ 家餐厅/u,
        }),
      );
      await tap(
        page,
        page.getByRole("button", { name: "查看想吃候选，3 家" }).last(),
      );
      await tap(
        page,
        page.getByRole("button", { name: "从 3 家想吃候选开始 Match" }),
      );

      const dialog = page.getByRole("dialog", { name: "Foodle Match" });
      const choiceGroup = dialog.getByRole("group", { name: "选择餐厅" });
      await expect(
        dialog.getByText("第 1 / 2 轮", { exact: true }),
      ).toBeVisible();
      await tap(page, choiceGroup.getByRole("button").first());
      await expect(
        dialog.getByText("第 2 / 2 轮", { exact: true }),
      ).toBeVisible();
      await tap(page, choiceGroup.getByRole("button").first());

      const result = dialog.getByTestId("match-result");
      await expect(result).toBeVisible();
      const resultName = await result.getByRole("heading").textContent();
      expect(resultName).toBeTruthy();
      const googleMaps = result.getByRole("link", { name: /Google Maps/u });
      const openRice = result.getByRole("link", { name: /OpenRice/u });
      await googleMaps.scrollIntoViewIfNeeded();
      await expect(googleMaps).toBeInViewport();
      await expect(openRice).toBeInViewport();
      await tap(page, dialog.getByRole("button", { name: "关闭 Match" }));

      await page.reload();
      await tap(
        page,
        page.getByRole("button", {
          name: /打开 Foodle Match，30 分钟范围，\d+ 家餐厅/u,
        }),
      );
      await tap(
        page,
        page.getByRole("button", { name: "查看想吃候选，3 家" }).last(),
      );
      const lastResult = page.getByRole("button", {
        name: new RegExp(`查看上次 Match：${resultName}$`, "u"),
      });
      await tap(page, lastResult);
      await expect(
        dialog.getByText("上次 Match", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: resultName ?? "" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("region", { name: "Foodle Match 餐厅发现" }),
      ).toBeHidden();
      await expect(
        page.getByRole("button", {
          name: /打开 Foodle Match，30 分钟范围，\d+ 家餐厅/u,
        }),
      ).toBeFocused();
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test("keeps or clears legacy local choices only after the selected action", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            byRestaurantId: {
              "sht-mock-meal": {
                decision: "saved",
                decidedAt: "2026-08-04T00:00:00.000Z",
              },
            },
          }),
        );
      },
      { key: decisionKey },
    );
    await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/food-map");

    let dialog = page.getByRole("dialog", {
      name: "处理本机 Foodle 记录",
    });
    await dialog.getByRole("button", { name: "暂不处理" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "本机记录已保留" }),
    ).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), decisionKey),
    ).not.toBeNull();
    expect(await savedDecision("sht-mock-meal")).toBeNull();

    await page.reload();
    dialog = page.getByRole("dialog", { name: "处理本机 Foodle 记录" });
    await dialog.getByRole("button", { name: "清除本机" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "本机记录已清除" }),
    ).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), decisionKey),
    ).toBeNull();
    expect(await savedDecision("sht-mock-meal")).toBeNull();
  });

  test("keeps 390px discovery usable in dark mode with reduced motion", async ({
    browser,
  }) => {
    const { context, page } = await mobilePage(browser);
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(() => {
        document.documentElement.classList.add("dark");
      });
      await page.goto("/food-map");
      await expect(
        page.getByRole("button", {
          name: /打开 Foodle Match，30 分钟范围，\d+ 家餐厅/u,
        }),
      ).toBeInViewport();
      await openShaTin(page);

      const surface = page.getByRole("dialog", { name: "餐厅发现" });
      const card = page.getByTestId("restaurant-card");
      expect(
        await surface.evaluate(
          (element) =>
            getComputedStyle(element.firstElementChild!).backgroundColor,
        ),
      ).not.toBe("rgb(255, 255, 255)");
      expect(
        await card.evaluate(
          (element) => getComputedStyle(element).transitionProperty,
        ),
      ).toBe("none");

      await tap(page, page.getByRole("button", { name: "想吃", exact: true }));
      const loginDialog = page.getByRole("dialog", { name: "登录后继续" });
      await expect(loginDialog).toBeVisible();
      expect(
        await loginDialog.evaluate(
          (element) => getComputedStyle(element).animationName,
        ),
      ).toBe("none");
      await loginDialog.getByRole("button", { name: "继续浏览" }).click();
      await expect(surface).toBeVisible();
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test("migrates legacy local choices only after explicit confirmation", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            byRestaurantId: {
              "sht-mock-meal": {
                decision: "saved",
                decidedAt: "2026-08-04T00:00:00.000Z",
              },
            },
          }),
        );
      },
      { key: decisionKey },
    );
    await loginWithPassword(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/food-map");

    const dialog = page.getByRole("dialog", {
      name: "处理本机 Foodle 记录",
    });
    await expect(dialog.getByText(/不会自动合并/u)).toBeVisible();
    expect(await savedDecision("sht-mock-meal")).toBeNull();
    await dialog.getByRole("button", { name: "迁移到账号" }).click();

    await expect(dialog).toBeHidden();
    await expect.poll(() => savedDecision("sht-mock-meal")).toBe("saved");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), decisionKey),
    ).toBeNull();
    await expect(page.getByText("想吃 1", { exact: true })).toBeVisible();
  });
});
