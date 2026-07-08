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
    await expect(items.first()).toContainText("评分 17");
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
    // 且被压到末尾：第 6–9 志愿才是命中的。
    await expect(items.nth(5)).toContainText("已避雷");
    await expect(items.nth(4)).not.toContainText("已避雷");
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

  test("页面标注非官方免责", async ({ page }) => {
    await page.goto("/college-picker");
    await expect(page.getByText(/非官方/)).toBeVisible();
    await expect(page.getByText(/暂不含医科/)).toBeVisible();
  });
});
