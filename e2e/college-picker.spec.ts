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
    // 工科 · 通勤/住宿/保宿 · 无避雷 的黄金第一志愿是晨兴书院。
    await expect(items.first()).toContainText("晨兴书院");
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
    // 工科·通勤/住宿/保宿 默认第一志愿是晨兴 mc，base 83 + MTR 4 = 87.0
    await expect(result.getByTestId("picker-item").first()).toContainText(
      "晨兴书院",
    );
    await expect(result.getByTestId("picker-score").first()).toContainText(
      "推荐指数 87.0",
    );
  });

  test("三个看重因素重复：给提示、不出结果", async ({ page }) => {
    await page.goto("/college-picker");

    // 把第二看重改成与第一看重相同（默认第一 = 上课通勤）。
    await page.getByTestId("priority-1").click();
    await page.getByRole("option", { name: "上课通勤" }).click();

    await page.getByTestId("recommend-button").click();

    await expect(page.getByTestId("picker-error")).toBeVisible();
    await expect(page.getByTestId("picker-result")).toHaveCount(0);
  });

  test("看重点留空时显示用户文案，不暴露内部值", async ({ page }) => {
    await page.goto("/college-picker");

    await page.getByTestId("priority-1").click();
    await page.getByRole("option", { name: "—（不填）" }).click();

    await expect(page.getByTestId("priority-1")).toContainText("—（不填）");
    await expect(page.getByTestId("priority-2")).toContainText("—（不填）");
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

  test("选择 A + 06 答案后推荐志愿显示推荐指数", async ({ page }) => {
    await page.goto("/college-picker");

    await page.getByTestId("preference-aim").click();
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
