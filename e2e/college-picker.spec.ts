import { test, expect } from "@playwright/test";

/**
 * 分院帽（College Picker）e2e — ref #228
 *
 * 匿名可访问的书院志愿推荐器：选项 → 九所书院 1–9 完整志愿。忠实移植自
 * lorasbb/College-Hat。这里钉住 walking skeleton 的端到端行为：默认场景出九志愿、
 * 避雷命中只后移不删除、三因素重复时给提示不出结果、免责文案存在。
 */

test.describe("#228 分院帽书院志愿推荐器", () => {
  test("匿名可访问，默认场景算出九所书院完整志愿", async ({ page }) => {
    const response = await page.goto("/college-picker");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "分院帽", level: 1 }),
    ).toBeVisible();

    await page.getByTestId("recommend-button").click();

    const result = page.getByTestId("picker-result");
    await expect(result).toBeVisible();
    const items = result.getByTestId("picker-item");
    // 不重不漏：恰好九条志愿。
    await expect(items).toHaveCount(9);
    // 工科 · 仅填通勤 · 无避雷，通勤排名最高的善衡书院为第一志愿。
    await expect(items.first()).toContainText("善衡书院");
    await expect(items.first()).toContainText("地理位置优越");
    await expect(items.first()).toContainText("共膳/高桌难吃");
    const crests = items.locator('img[alt=""]');
    await expect(crests).toHaveCount(9);
    await expect(result.getByRole("img")).toHaveCount(0);
    await expect
      .poll(() =>
        crests.evaluateAll((images) =>
          images.every((image) => {
            const crest = image as HTMLImageElement;
            return (
              crest.complete &&
              crest.naturalWidth > 0 &&
              /^\/college-crests\/[a-z]+\.svg$/.test(
                crest.getAttribute("src") ?? "",
              )
            );
          }),
        ),
      )
      .toBe(true);
  });

  test("勾选避雷：命中书院被压到末尾并标注，而非消失", async ({ page }) => {
    await page.goto("/college-picker");

    await page.getByTestId("avoid-College_FYP").click();
    await page.getByTestId("recommend-button").click();

    const result = page.getByTestId("picker-result");
    await expect(result).toBeVisible();
    const items = result.getByTestId("picker-item");
    // 仍是九所，一所不少。
    await expect(items).toHaveCount(9);
    // 四所 FYP=Y 的书院（崇基/联合/敬文/伍宜孙）被标「已避雷」。
    await expect(result.getByText("已避雷")).toHaveCount(4);
    // 裁决：A/B/C 分区优先，避雷只在各分区内排末尾。本场景 mc(小书院)最高分
    // → C-i：非小书院块(槽 2-7)内避雷命中的 cc/uc/wys 排到该块末尾(5-7)，
    // 小书院块(槽 8-9)内 cwc(避雷)排到 9。故第 1 志愿干净、末位避雷。
    await expect(items.first()).not.toContainText("已避雷");
    await expect(items.last()).toContainText("已避雷");
  });

  test("勾选其他看重因素「离港铁距离」：推荐指数加分生效", async ({ page }) => {
    await page.goto("/college-picker");

    await page.getByTestId("bonus-MTR_Distance").click();
    await page.getByTestId("recommend-button").click();

    const result = page.getByTestId("picker-result");
    await expect(result).toBeVisible();
    // 工科·仅填通勤，善衡 shho 为 base 90 + MTR 4 = 94.0。
    await expect(result.getByTestId("picker-item").first()).toContainText(
      "善衡书院",
    );
    await expect(result.getByTestId("picker-score").first()).toContainText(
      "推荐指数 94.0",
    );
  });

  test("重复的看重因素被拒绝并给出 toast 提示", async ({ page }) => {
    await page.goto("/college-picker");

    // 把第二看重改成与第一看重相同（默认第一 = 上课通勤）。
    await page.getByTestId("priority-1").click();
    await page.getByRole("option", { name: "上课通勤" }).click();

    await expect(page.getByText("该因素已被选择！")).toBeVisible();
    await expect(page.getByTestId("priority-1")).toContainText("None");
  });

  test("第二看重设为 None 时清空第三看重", async ({ page }) => {
    await page.goto("/college-picker");

    await page.getByTestId("priority-1").click();
    await page
      .locator('[data-slot="select-content"][data-open]')
      .getByRole("option", { name: "住宿环境" })
      .click();

    await page.getByTestId("priority-2").click();
    await page
      .locator('[data-slot="select-content"][data-open]')
      .getByRole("option", { name: "保宿机会" })
      .click();

    await page.getByTestId("priority-1").click();
    await page
      .locator('[data-slot="select-content"][data-open]')
      .getByRole("option", { name: "None" })
      .click();

    await expect(page.getByTestId("priority-1")).toContainText("None");
    await expect(page.getByTestId("priority-2")).toContainText("None");
  });

  test("选择 A 后展开 06 小书院精选，选择 B/C 不显示", async ({ page }) => {
    await page.goto("/college-picker");

    // 默认 C，不显示 06
    await expect(page.getByText("小书院精选")).toHaveCount(0);

    // 选择 A
    await page.getByTestId("preference-aim").click();
    await expect(page.getByText("小书院精选")).toBeVisible();

    // 切回 B，06 消失
    await page.getByTestId("preference-avoid").click();
    await expect(page.getByText("小书院精选")).toHaveCount(0);
  });

  test("选择 A 但未答完 06 问卷时给出 toast 提示", async ({ page }) => {
    await page.goto("/college-picker");

    await page.getByTestId("preference-aim").click();
    await page.getByTestId("recommend-button").click();

    await expect(
      page.getByText("小书院精选题未做完，做完后生成结果"),
    ).toBeVisible();
    await expect(page.getByTestId("picker-result")).toHaveCount(0);
  });

  test("选择 A + 答完 06 问卷后显示推荐结果", async ({ page }) => {
    await page.goto("/college-picker");

    await page.getByTestId("preference-aim").click();
    await page.getByTestId("sc-q-0").locator('input[value="A"]').check();
    await page.getByTestId("sc-q-1").locator('input[value="A"]').check();
    await page.getByTestId("sc-q-2").locator('input[value="A"]').check();
    await page.getByTestId("sc-q-3").locator('input[value="A"]').check();
    await page.getByTestId("recommend-button").click();

    const result = page.getByTestId("picker-result");
    await expect(result).toBeVisible();
    // 结果卡片应显示推荐指数
    await expect(result.getByTestId("picker-score").first()).toContainText(
      "推荐指数",
    );
  });

  test("页面标注非官方免责", async ({ page }) => {
    await page.goto("/college-picker");
    await expect(page.getByText(/非官方/)).toBeVisible();
    await expect(page.getByText(/暂不含医科/)).toBeVisible();
  });
});
