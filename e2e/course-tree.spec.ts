import { test, expect } from "@playwright/test";

/**
 * 选课技能树 walking skeleton e2e — ref #163 / #156
 *
 * 匿名可访问的「课程加点模拟器」第一竖切:选一个主修 → 课程按类目铺成扁平技能树 →
 * 自由点亮/取消 → 实时总学分与每类软进度。钉住端到端行为:
 * 默认出确定性种子主修、缺失成员灰显占位、点亮即时更新总学分与「还差 N 学分」、
 * 切换主修换一棵树且清空点亮(不落库)。
 *
 * 种子(scripts/course-tree-seed.ts,e2e 干净库里只有这两个主修)形态:
 *   Computer Science (Seed) · 99 学分
 *     - Required Core        required  12 学分  4 门(CSCI1130/1120/2100/ENGG2020)
 *     - Mathematics Requirement one-of  选 1 门   2 门(MATH1510/1030)
 *     - Advanced Electives   basket    9 学分   5 门(含 GESC1000 缺失占位)
 *   Mathematics (Seed) · 90 学分  两个类目
 */

test.describe("#163 选课技能树", () => {
  test("匿名访问,默认主修按类目铺出技能树,缺失成员灰显", async ({ page }) => {
    const response = await page.goto("/course-tree");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "选课技能树", level: 1 }),
    ).toBeVisible();

    // 默认选中按 name 升序第一的主修 = Computer Science (Seed)。
    const nodes = page.getByTestId("course-node");
    await expect(nodes.first()).toBeVisible();
    // 4 + 2 + 5 = 11 门(含 1 门缺失占位)。
    await expect(nodes).toHaveCount(11);
    // 三个类目分组。
    await expect(page.getByTestId("category-group")).toHaveCount(3);

    // 起始未点亮任何课:0 / 99。
    await expect(page.getByTestId("total-units")).toHaveText("0 / 99");

    // courses 表缺失的成员 GESC1000 → 占位、禁用、不可点。
    const missing = page.locator('[data-code="GESC1000"]');
    await expect(missing).toBeDisabled();
    await expect(missing).toContainText("暂无课程详情");

    // 有详情的课节点携带 hover 简介(原生 title)。
    await expect(page.locator('[data-code="CSCI1130"]')).toHaveAttribute(
      "title",
      /Java/,
    );
  });

  test("点亮/取消课程实时更新总学分与类目软进度", async ({ page }) => {
    await page.goto("/course-tree");

    const total = page.getByTestId("total-units");
    await expect(total).toHaveText("0 / 99");

    const requiredCore = page
      .getByTestId("category-group")
      .filter({ hasText: "Required Core" });
    const coreProgress = requiredCore.getByTestId("category-progress");
    // 12 学分要求,尚未点亮 → 还差 12。
    await expect(coreProgress).toHaveText("还差 12 学分");

    // 点亮 CSCI1130(3 学分)。
    const csci1130 = page.locator('[data-code="CSCI1130"]');
    await csci1130.click();
    await expect(csci1130).toHaveAttribute("data-lit", "true");
    await expect(csci1130).toHaveAttribute("aria-pressed", "true");
    await expect(total).toHaveText("3 / 99");
    await expect(coreProgress).toHaveText("还差 9 学分");

    // 再点亮 CSCI1120(3 学分)→ 累加。
    await page.locator('[data-code="CSCI1120"]').click();
    await expect(total).toHaveText("6 / 99");
    await expect(coreProgress).toHaveText("还差 6 学分");

    // 取消 CSCI1130 → 回落。
    await csci1130.click();
    await expect(csci1130).toHaveAttribute("data-lit", "false");
    await expect(total).toHaveText("3 / 99");
    await expect(coreProgress).toHaveText("还差 9 学分");
  });

  test("多选一类目点满 1 门即『已满』", async ({ page }) => {
    await page.goto("/course-tree");

    const mathReq = page
      .getByTestId("category-group")
      .filter({ hasText: "Mathematics Requirement" });
    const mathProgress = mathReq.getByTestId("category-progress");
    // pickN=1,起始还差 1 门。
    await expect(mathProgress).toHaveText("还差 1 门");

    await page.locator('[data-code="MATH1510"]').click();
    await expect(mathProgress).toHaveText("已满 ✓");
  });

  test("切换主修换一棵树并清空点亮(不落库)", async ({ page }) => {
    await page.goto("/course-tree");

    // 先在默认主修点亮一门,制造非零状态。
    await page.locator('[data-code="CSCI1130"]').click();
    await expect(page.getByTestId("total-units")).toHaveText("3 / 99");

    // 打开主修下拉,切到 Mathematics (Seed)。
    await page.getByTestId("major-select").click();
    await page.getByRole("option", { name: /Mathematics \(Seed\)/ }).click();

    // 新树:两个类目,总学分归零、上限变 90。
    await expect(page.getByTestId("category-group")).toHaveCount(2);
    await expect(page.getByTestId("total-units")).toHaveText("0 / 90");
    // 旧主修的 CSCI1130 不在这棵树里。
    await expect(page.locator('[data-code="CSCI1130"]')).toHaveCount(0);
  });

  test("页面标注非官方免责", async ({ page }) => {
    await page.goto("/course-tree");
    await expect(page.getByText(/非官方/)).toBeVisible();
    await expect(page.getByText(/以学系正式手册为准/)).toBeVisible();
  });
});
