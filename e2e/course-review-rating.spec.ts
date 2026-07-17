import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";
import { selectSeedProfessor } from "./helpers/course-review";

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

async function fillExperience(page: Page) {
  await page.getByLabel("学年").selectOption("2025-26");
  await page.getByLabel("学期").selectOption("Term 2");
  await selectSeedProfessor(page);
}

test.afterEach(async () => {
  await query("delete from course_reviews where course_code = 'CSCI1130'");
  await query("delete from course_ratings where course_code = 'CSCI1130'");
  await query("delete from course_reviews where course_code = 'CSCI1120'");
  await query("delete from course_ratings where course_code = 'CSCI1120'");
  await query("delete from course_enrollments where course_code = 'CSCI1120'");
});

test("#351 course with confirmed empty instructor data accepts a review without professor", async ({
  page,
}) => {
  await query(
    `insert into course_enrollments (
       academic_year, term, course_code, class_code, class_nbr,
       component, section, quota, vacancy, instructors, captured_at
     ) values (
       '2025-26', 'Term 1', 'CSCI1120', 'CSCI1120', '351',
       'LEC', '-LEC', 30, 5, '{}', now()
     )`,
  );

  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/courses/CSCI1120");

  await page.getByRole("link", { name: "写测评" }).click();
  await expect(page.getByText("课程资料未列任课教授，可留空")).toBeVisible();
  await page.getByLabel("学年").selectOption("2025-26");
  await page.getByLabel("学期").selectOption("Term 1");
  await page.getByRole("radio", { name: "4.5 星" }).click();
  await page.getByRole("button", { name: "提交测评" }).click();

  await expect
    .poll(async () => {
      const result = await query<{ professor_id: string | null }>(
        `select professor_id from course_ratings r
       join users u on u.id = r.user_id
       where r.course_code = 'CSCI1120' and u.email = 'user@test.com'`,
      );
      return result.rows;
    })
    .toEqual([{ professor_id: null }]);
});

test("#293 unified submission validates required experience and supports half-star bounds", async ({
  page,
}) => {
  await page.goto("/courses/CSCI1130");
  const form = page.locator("section").filter({ hasText: "提交课程测评" });
  await expect(form.getByRole("link", { name: "登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交测评" })).toHaveCount(0);

  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/courses/CSCI1130");
  await page.getByRole("link", { name: "写测评" }).click();
  const submit = page.getByRole("button", { name: "提交测评" });
  await expect(submit).toBeDisabled();

  await fillExperience(page);
  await expect(submit).toBeDisabled();
  await page.getByRole("radio", { name: "0.5 星" }).click();
  await expect(submit).toBeEnabled();
  await submit.click();

  let rating = await query<{
    score: number;
    academic_year: string;
    term: string;
  }>(
    `select score, academic_year, term from course_ratings r
     join users u on u.id = r.user_id
     where r.course_code = 'CSCI1130' and u.email = 'user@test.com'`,
  );
  expect(rating.rows).toEqual([
    { score: 0.5, academic_year: "2025-26", term: "Term 2" },
  ]);
  const reviews = await query<{ count: number }>(
    "select count(*)::int as count from course_reviews where course_code = 'CSCI1130'",
  );
  expect(reviews.rows[0].count).toBe(0);

  await expect(page.getByText("课程测评已发布")).toBeVisible();
  await page.getByLabel("按任课教授筛选").selectOption("seed-professor-chan");
  const professorSummary = page.getByTestId("professor-rating-summary");
  await expect(professorSummary).toContainText("0.5");
  await expect(professorSummary).toContainText("/ 5");
  await expect(professorSummary).toContainText("2025-26");
  await expect(professorSummary).toContainText("Term 2");
  await expect(professorSummary).toContainText("1 次评分");

  await page.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByLabel("学年")).toHaveValue("2025-26");
  await expect(page.getByLabel("学期")).toHaveValue("Term 2");
  await expect(page.getByPlaceholder("搜索任课教授姓名")).toHaveValue(
    "测试教授 Chan",
  );
  await expect(page.getByRole("radio", { name: "0.5 星" })).toBeChecked();

  await page.getByRole("radio", { name: "5 星", exact: true }).click();
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect
    .poll(async () => {
      rating = await query(
        `select score, academic_year, term from course_ratings r
         join users u on u.id = r.user_id
         where r.course_code = 'CSCI1130' and u.email = 'user@test.com'`,
      );
      return rating.rows;
    })
    .toEqual([{ score: 5, academic_year: "2025-26", term: "Term 2" }]);
});
