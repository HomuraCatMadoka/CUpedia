import { test, expect } from "@playwright/test";

import { loginWithPassword } from "./helpers/auth";

/**
 * 选课技能树的 full-stack/browser boundaries — ref #163/#164/#235/#167.
 *
 * Pure build rules and client-state branches run in compute-tree,
 * evaluate-build, layout-canvas, and CourseTreeView unit/component tests.
 * These journeys retain only the production route, real browser SVG geometry,
 * and authenticated PostgreSQL persistence boundaries.
 */

test("anonymous route renders the seeded tree and disclaimer", async ({
  page,
}) => {
  const response = await page.goto("/course-tree");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { name: "选课技能树", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("handbook-year-select")).toHaveValue("2023-24");
  await expect(page.getByTestId("course-node")).toHaveCount(11);
  await expect(page.getByTestId("category-group")).toHaveCount(3);
  await expect(page.getByTestId("total-units")).toHaveText("0 / 99");
  await expect(page.locator('[data-code="GESC1000"]')).toBeDisabled();
  await expect(page.getByTestId("login-to-save")).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(page.getByText(/非官方/)).toBeVisible();
  await expect(page.getByText(/以学系正式手册为准/)).toBeVisible();
});

test("real browser lays out prerequisite edges and external prerequisite tooltip", async ({
  page,
}) => {
  await page.goto("/course-tree");

  const edges = page.getByTestId("prereq-edge");
  await expect(edges.first()).toBeAttached();
  await expect(edges).toHaveCount(3);
  await expect(
    page.locator('[data-testid="prereq-edge"][data-to="CSCI2100"]'),
  ).toHaveCount(2);

  const levelOf = async (code: string) => {
    const column = page.locator('[data-testid="tree-column"]', {
      has: page.locator(`[data-code="${code}"]`),
    });
    return Number(await column.getAttribute("data-level"));
  };
  const [level1130, level2100, level3230] = await Promise.all([
    levelOf("CSCI1130"),
    levelOf("CSCI2100"),
    levelOf("CSCI3230"),
  ]);
  expect(level2100).toBeGreaterThan(level1130);
  expect(level3230).toBeGreaterThan(level2100);

  await page.locator('[data-code="CSCI3130"]').hover();
  await expect(page.getByTestId("course-tip")).toContainText("CSCI2110");
});

test("authenticated user persists and restores multiple builds in PostgreSQL", async ({
  page,
}) => {
  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/course-tree");

  await page.getByRole("button", { name: "严格模式" }).click();
  await page.locator('[data-code="MATH1510"]').click();
  await page.getByTestId("build-name").fill("严格数学路线");
  await page.getByTestId("save-build").click();
  await expect(page.getByRole("status")).toHaveText("已保存");

  await page.locator('[data-code="MATH1510"]').click();
  await page.getByRole("button", { name: "自由模式" }).click();
  await page.getByTestId("build-name").fill("自由探索路线");
  await page.getByTestId("save-build").click();
  await expect(page.getByRole("status")).toHaveText("已保存");

  const builds = page.getByTestId("saved-builds");
  await expect(builds.locator("option")).toHaveCount(3);
  await builds.selectOption({ label: "严格数学路线" });
  await expect(page.getByRole("status")).toHaveText("已载入");
  await expect(page.getByRole("button", { name: "严格模式" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-code="MATH1510"]')).toHaveAttribute(
    "data-term",
    "1",
  );
});
