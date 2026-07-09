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

test.describe("#164 先修边与拓扑分层", () => {
  test("本树内先修渲染成边 chip,出树先修落文字提示", async ({ page }) => {
    await page.goto("/course-tree");

    // CSCI2100 先修「CSCI1120 or 1130 or …」→ 本树内 1120/1130 渲染成先修 chip。
    const dataStructures = page.locator('[data-code="CSCI2100"]');
    const prereq = dataStructures.getByTestId("course-prereq");
    await expect(prereq).toBeVisible();
    await expect(prereq).toContainText("CSCI1130");
    await expect(prereq).toContainText("CSCI1120");

    // CSCI3130 先修全在树外(CSCI2110/ENGG2440/…)→ 不连边,落文字提示。
    const formal = page.locator('[data-code="CSCI3130"]');
    await expect(formal.getByTestId("course-prereq")).toHaveCount(0);
    await expect(formal.getByTestId("course-prereq-note")).toContainText(
      "CSCI2110",
    );
  });

  test("自由模式只连不拦:先修未点亮也能点亮本课", async ({ page }) => {
    await page.goto("/course-tree");

    const ai = page.locator('[data-code="CSCI3230"]'); // 先修 CSCI2100
    const dataStructures = page.locator('[data-code="CSCI2100"]');

    // 先修 CSCI2100 尚未点亮。
    await expect(dataStructures).toHaveAttribute("data-lit", "false");
    // 直接点亮 CSCI3230 —— 不应被先修阻拦。
    await ai.click();
    await expect(ai).toHaveAttribute("data-lit", "true");
    // 先修仍未点亮,证明「只连不拦」。
    await expect(dataStructures).toHaveAttribute("data-lit", "false");

    // 点亮先修 CSCI2100 后,CSCI3230 上对应先修 chip 翻成「已满足」。
    await dataStructures.click();
    await expect(ai.locator('[data-prereq="CSCI2100"]')).toHaveAttribute(
      "data-satisfied",
      "true",
    );
  });

  test("拓扑分层:被先修者排在其先修之后", async ({ page }) => {
    await page.goto("/course-tree");

    // Required Core 内按拓扑层升序:CSCI1120/1130(L1)在 CSCI2100(L2)之前。
    const coreNodes = page
      .getByTestId("category-group")
      .filter({ hasText: "Required Core" })
      .getByTestId("course-node");
    // evaluateAll 不自动等待:先等节点渲染出来,避免异步拉树前读到空数组。
    await expect(coreNodes.first()).toBeVisible();
    const codes = await coreNodes.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-code")),
    );
    expect(codes.indexOf("CSCI2100")).toBeGreaterThan(
      codes.indexOf("CSCI1130"),
    );
    expect(codes.indexOf("CSCI2100")).toBeGreaterThan(
      codes.indexOf("CSCI1120"),
    );
  });
});
