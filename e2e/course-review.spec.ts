import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";
import { selectSeedProfessor } from "./helpers/course-review";

// Course-review feature: subject filter (#267) + the logged-in rate/review/like
// lifecycle (#178). Runs against the isolated e2e db, which provision.ts wipes
// and re-seeds each run — the catalog there is the 26 SEED_COURSES fixture
// (CSCI×14, MATH×6, …), so assertions derive expected counts from the db
// rather than hard-coding them.

const CODE = "CSCI1130";
const review = `great-course-${randomUUID().slice(0, 8)}`;

async function query<T extends Record<string, unknown>>(text: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query<T>(text);
  } finally {
    await client.end();
  }
}

test.afterEach(async () => {
  await query(`delete from course_reviews where course_code = '${CODE}'`);
  await query(`delete from course_ratings where course_code = '${CODE}'`);
});

test("#267 subject filter shows the whole subject, uncapped", async ({
  page,
}) => {
  const { rows } = await query<{ count: string }>(
    "select count(*)::int as count from courses where subject = 'CSCI'",
  );
  const expected = Number(rows[0].count);
  expect(expected).toBeGreaterThan(0);

  await page.goto("/courses?subject=CSCI");

  await expect(
    page.getByText(`找到 ${expected} 门课程`, { exact: true }),
  ).toBeVisible();

  const cards = page.locator('a[href^="/courses/"]');
  await expect(cards).toHaveCount(expected);
  // Every card belongs to the selected subject.
  const hrefs = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")),
  );
  expect(hrefs.every((h) => h?.startsWith("/courses/CSCI"))).toBe(true);
});

test("#267 level filter narrows to a single course level", async ({ page }) => {
  // Level = leading digit of the code number; 1000-level = codes like CSCI1xxx.
  const { rows } = await query<{ count: string }>(
    "select count(*)::int as count from courses " +
      "where subject = 'CSCI' and substring(code from '[0-9]') = '1'",
  );
  const expected = Number(rows[0].count);
  expect(expected).toBeGreaterThan(0);

  await page.goto("/courses?subject=CSCI&level=1000");

  await expect(
    page.getByText(`找到 ${expected} 门课程`, { exact: true }),
  ).toBeVisible();

  const cards = page.locator('a[href^="/courses/"]');
  await expect(cards).toHaveCount(expected);
  const hrefs = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")),
  );
  // Every card is a CSCI 1000-level course.
  expect(hrefs.every((h) => h?.startsWith("/courses/CSCI1"))).toBe(true);
});

test("#178 logged-in rate + review + like lifecycle", async ({ page }) => {
  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto(`/courses/${CODE}`);

  // One submission records the concrete offering, rating and optional comment.
  await page.getByLabel("学年").selectOption("2025-26");
  await page.getByLabel("学期").selectOption("Term 2");
  await selectSeedProfessor(page);
  await page.getByRole("radio", { name: "4.5 星" }).click();
  await page.getByPlaceholder(/分享课程内容/).fill(review);
  await page.getByRole("button", { name: "提交测评" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: review }),
  ).toBeVisible();
  await expect(page.getByText("课程测评已发布")).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑" })).toBeVisible();
  await expect(page.getByRole("button", { name: "删除" })).toBeVisible();
  await expect(page.getByRole("button", { name: /撤回/ })).toHaveCount(0);
  await expect(page.getByText("4.5", { exact: true }).first()).toBeVisible();

  // Like: toggle the like on the just-posted review, count 0 → 1.
  const likeBtn = page.locator('button[title="点赞"]');
  await expect(likeBtn).toContainText("0");
  await likeBtn.click();
  await expect(likeBtn).toContainText("1");

  // Persists across a reload.
  await page.reload();
  await expect(page.getByText("4.5", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: review }),
  ).toBeVisible();
  await expect(page.locator('button[title="点赞"]')).toContainText("1");

  // The redesigned list card reflects the new rating.
  await page.goto("/courses?subject=CSCI");
  const courseCard = page.locator(`a[href="/courses/${CODE}"]`);
  await expect(courseCard).toContainText("4.5");
  await expect(courseCard).toContainText("/5");
  await expect(courseCard).not.toContainText("/10");
});
