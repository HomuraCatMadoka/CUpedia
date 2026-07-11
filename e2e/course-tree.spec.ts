import { test, expect } from "@playwright/test";

/**
 * 选课技能树画布 e2e — ref #163 / #164 / #235 / #165 / #156
 *
 * 匿名可访问的「课程加点模拟器」画布竖切:选一个主修 → 课程按**拓扑层分列** →
 * SVG 贝塞尔先修连线 → 自由点亮/取消 → 实时总学分与每类软进度摘要。钉住端到端行为:
 * 默认出确定性种子主修、缺失成员灰显占位、点亮即时更新总学分与「还差 N 学分」、
 * 切换主修换一棵树且清空点亮(不落库);#164/#235:树内先修画成边、出树先修落
 * 悬浮提示、点亮先修使边高亮、被先修课落在更深的列(拓扑左→右)。
 *
 * 种子(scripts/course-tree-seed.ts,e2e 干净库里只有这两个主修)形态:
 *   Computer Science (Seed) · 99 学分 · 11 门
 *     - Required Core        required  12 学分  4 门(CSCI1130/1120/2100/ENGG2020)
 *     - Mathematics Requirement one-of  选 1 门   2 门(MATH1510/1030)
 *     - Advanced Electives   basket    9 学分   5 门(含 GESC1000 缺失占位)
 *   Mathematics (Seed) · 90 学分  两个类目
 *
 * 树内先修边(computeTree 过滤成本树内):
 *   CSCI1120→CSCI2100、CSCI1130→CSCI2100、CSCI2100→CSCI3230(共 3 条)。
 *   CSCI3130 先修全在树外(CSCI2110/…)→ 无边,仅悬浮提示。
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

    // 再点亮 ENGG2020(3 学分)→ 累加。
    // (不用 CSCI1120:它与 CSCI1130 双向互斥,已并成多选一组,点 1130 后即被硬锁——见 #165 用例。)
    await page.locator('[data-code="ENGG2020"]').click();
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

test.describe("#164/#235 先修边与拓扑分列(画布)", () => {
  test("树内先修渲染成 SVG 边,出树先修落悬浮提示", async ({ page }) => {
    await page.goto("/course-tree");

    // 边图层与节点都渲染出来后再测边(布局测量在 useLayoutEffect,等首条边出现)。
    const edges = page.getByTestId("prereq-edge");
    await expect(edges.first()).toBeAttached();
    // 树内共 3 条:CSCI1120→2100、CSCI1130→2100、CSCI2100→3230。
    await expect(edges).toHaveCount(3);

    // CSCI2100 先修「CSCI1120 or 1130 or …」→ 本树内 1120/1130 各连一条,指向 2100。
    await expect(
      page.locator('[data-testid="prereq-edge"][data-to="CSCI2100"]'),
    ).toHaveCount(2);
    await expect(
      page.locator(
        '[data-testid="prereq-edge"][data-from="CSCI1130"][data-to="CSCI2100"]',
      ),
    ).toBeAttached();
    await expect(
      page.locator(
        '[data-testid="prereq-edge"][data-from="CSCI1120"][data-to="CSCI2100"]',
      ),
    ).toBeAttached();

    // CSCI3130 先修全在树外(CSCI2110/ENGG2440/…)→ 无入边,只在悬浮提示里说明。
    await expect(
      page.locator('[data-testid="prereq-edge"][data-to="CSCI3130"]'),
    ).toHaveCount(0);
    await page.locator('[data-code="CSCI3130"]').hover();
    await expect(page.getByTestId("course-tip")).toContainText("CSCI2110");
  });

  test("自由模式只连不拦:先修未点亮也能点亮本课,点亮后边高亮", async ({
    page,
  }) => {
    await page.goto("/course-tree");

    const ai = page.locator('[data-code="CSCI3230"]'); // 先修 CSCI2100
    const dataStructures = page.locator('[data-code="CSCI2100"]');
    const edge = page.locator(
      '[data-testid="prereq-edge"][data-from="CSCI2100"][data-to="CSCI3230"]',
    );
    await expect(edge).toBeAttached();

    // 先修 CSCI2100 尚未点亮 → 边未高亮。
    await expect(dataStructures).toHaveAttribute("data-lit", "false");
    await expect(edge).toHaveAttribute("data-hot", "false");

    // 直接点亮 CSCI3230 —— 不应被先修阻拦。
    await ai.click();
    await expect(ai).toHaveAttribute("data-lit", "true");
    // 先修仍未点亮,证明「只连不拦」;边仍未高亮(高亮跟随「先修」是否点亮)。
    await expect(dataStructures).toHaveAttribute("data-lit", "false");
    await expect(edge).toHaveAttribute("data-hot", "false");

    // 点亮先修 CSCI2100 后,这条先修边翻成高亮。
    await dataStructures.click();
    await expect(edge).toHaveAttribute("data-hot", "true");
  });

  test("拓扑分列:被先修课落在比其先修更深的列", async ({ page }) => {
    await page.goto("/course-tree");

    await expect(page.locator('[data-code="CSCI2100"]')).toBeVisible();
    // 某课号所在列的 data-level(列 = 拓扑层)。
    const levelOf = async (code: string) => {
      const col = page.locator('[data-testid="tree-column"]', {
        has: page.locator(`[data-code="${code}"]`),
      });
      return Number(await col.getAttribute("data-level"));
    };

    // CSCI2100 先修 CSCI1120/1130,落在更深的列;CSCI3230 先修 CSCI2100,更深一层。
    const [l1120, l1130, l2100, l3230] = await Promise.all([
      levelOf("CSCI1120"),
      levelOf("CSCI1130"),
      levelOf("CSCI2100"),
      levelOf("CSCI3230"),
    ]);
    expect(l2100).toBeGreaterThan(l1120);
    expect(l2100).toBeGreaterThan(l1130);
    expect(l3230).toBeGreaterThan(l2100);
  });
});

test.describe("#165 等价组多选一", () => {
  test("双向互斥课并成多选一组:点亮一门其余置灰,取消后恢复", async ({
    page,
  }) => {
    await page.goto("/course-tree");

    // Required Core 里 CSCI1120↔CSCI1130 双向互斥(C++ vs Java 入门)→ 并成唯一一个多选一组。
    const group = page.getByTestId("equiv-group");
    await expect(group).toHaveCount(1);
    await expect(group).toHaveAttribute("data-codes", "CSCI1120,CSCI1130");

    const java = page.locator('[data-code="CSCI1130"]');
    const cpp = page.locator('[data-code="CSCI1120"]');

    // 初始两门都可选。
    await expect(java).toBeEnabled();
    await expect(cpp).toBeEnabled();

    // 点亮 CSCI1130 → 同组的 CSCI1120 置灰不可选(硬锁)。
    await java.click();
    await expect(java).toHaveAttribute("data-lit", "true");
    await expect(cpp).toBeDisabled();
    await expect(cpp).toHaveAttribute("data-blocked", "true");

    // 取消 CSCI1130 → CSCI1120 恢复可选。
    await java.click();
    await expect(java).toHaveAttribute("data-lit", "false");
    await expect(cpp).toBeEnabled();
    await expect(cpp).toHaveAttribute("data-blocked", "false");
  });

  test("下游先修指向等价组:点亮组内任一即让先修满足(边高亮)", async ({
    page,
  }) => {
    await page.goto("/course-tree");

    // CSCI2100 先修「CSCI1120 或 CSCI1130」——两者是同一等价组,点亮任一即满足。
    const edgeFrom1120 = page.locator(
      '[data-testid="prereq-edge"][data-from="CSCI1120"][data-to="CSCI2100"]',
    );
    const edgeFrom1130 = page.locator(
      '[data-testid="prereq-edge"][data-from="CSCI1130"][data-to="CSCI2100"]',
    );
    await expect(edgeFrom1120).toBeAttached();
    await expect(edgeFrom1130).toBeAttached();

    // 只点亮组内的 CSCI1130。
    await page.locator('[data-code="CSCI1130"]').click();

    // 指向 CSCI2100 的两条先修边都翻高亮:点组内任一即满足(#165)。
    await expect(edgeFrom1130).toHaveAttribute("data-hot", "true");
    await expect(edgeFrom1120).toHaveAttribute("data-hot", "true");
  });
});

test.describe("#166 严格模式逐学期点亮", () => {
  test("按八学期分配课程，季节不符被拦，旁路只警告", async ({ page }) => {
    await page.goto("/course-tree");
    await page.getByRole("button", { name: "严格模式" }).click();

    const term = page.getByTestId("active-term");
    await expect(term.locator("option")).toHaveCount(8);
    await term.selectOption("2");

    const java = page.locator('[data-code="CSCI1130"]');
    await java.click();
    await expect(java).toHaveAttribute("data-lit", "false");
    await expect(page.getByTestId("strict-feedback")).toContainText(
      "不在当前季节开课",
    );

    const ai = page.locator('[data-code="CSCI3230"]');
    await ai.click();
    await expect(ai).toHaveAttribute("data-lit", "true");
    await expect(ai).toHaveAttribute("data-term", "2");
    await expect(page.getByTestId("strict-feedback")).toContainText("旁路条款");
  });

  test("可调学分上限即时阻止超载", async ({ page }) => {
    await page.goto("/course-tree");
    await page.getByRole("button", { name: "严格模式" }).click();
    await page.getByTestId("term-cap").fill("3");

    const calculus = page.locator('[data-code="MATH1510"]');
    const statistics = page.locator('[data-code="STAT2001"]');
    await calculus.click();
    await expect(calculus).toHaveAttribute("data-term", "1");

    await statistics.click();
    await expect(statistics).toHaveAttribute("data-lit", "false");
    await expect(page.getByTestId("strict-feedback")).toContainText(
      "超过上限 3",
    );
  });
});
