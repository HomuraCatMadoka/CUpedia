import { Client } from "pg";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./helpers/auth";

const PERSON_ID = "e2e-professor-directory-person";
const PUBLIC_ID = "7a7ca8c9-1dd2-4b06-8ff9-d55b64d7f7b5";
const PROFESSOR_NAME = "Professor E2E CHAN";
const FACULTY_ID = "e2e-professor-directory-faculty";
const DEPARTMENT_ID = "e2e-professor-directory-department";
const COURSE_CODE = "CSCI1130";
const PROFILE_URL = "https://www.cse.cuhk.edu.hk/people/e2e-chan";
const LEGACY_PROFESSOR_ID = "e2e-professor-directory-legacy";

async function withDatabase(
  callback: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await callback(client);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  await withDatabase(async (client) => {
    await client.query(
      `insert into staff_organisations
         (id, name, organisation_type, profile_url, source)
       values
         ($1, 'Faculty of Engineering', 'faculty', 'https://www.erg.cuhk.edu.hk/e2e', 'e2e'),
         ($2, 'Department of Computer Science and Engineering', 'department', 'https://www.cse.cuhk.edu.hk/e2e', 'e2e')
       on conflict (id) do update set name = excluded.name`,
      [FACULTY_ID, DEPARTMENT_ID],
    );
    await client.query(
      `update staff_organisations
       set parent_id = $1, faculty_id = $1
       where id = $2`,
      [FACULTY_ID, DEPARTMENT_ID],
    );
    await client.query(
      `insert into staff_people (id, canonical_name, source, identity_kind)
       values ($1, $2, 'e2e', 'official')
       on conflict (id) do update set
         canonical_name = excluded.canonical_name,
         identity_kind = excluded.identity_kind`,
      [PERSON_ID, PROFESSOR_NAME],
    );
    await client.query(
      `insert into course_instructors (person_id, public_id)
       values ($1, $2)
       on conflict (person_id) do update set public_id = excluded.public_id`,
      [PERSON_ID, PUBLIC_ID],
    );
    await client.query(
      `insert into staff_organisation_affiliations
         (person_id, organisation_id, source_url)
       values ($1, $2, $4), ($1, $3, $4)
       on conflict (person_id, organisation_id) do update set is_current = true`,
      [PERSON_ID, FACULTY_ID, DEPARTMENT_ID, PROFILE_URL],
    );
    await client.query(
      `insert into staff_person_sources
         (person_id, source, source_key, profile_url, role_label,
          appointment_kind, profile_verified_at, source_url)
       values ($1, 'cuhk_department:cse', 'e2e-chan', $2,
               'Professor', 'regular', now(), $2)
       on conflict (source, source_key) do update set
         person_id = excluded.person_id,
         profile_url = excluded.profile_url,
         profile_verified_at = excluded.profile_verified_at,
         is_current = true`,
      [PERSON_ID, PROFILE_URL],
    );
    await client.query(
      `insert into professors (id, name, search_text)
       values ($1, $2, lower($2))
       on conflict (id) do update set name = excluded.name`,
      [LEGACY_PROFESSOR_ID, PROFESSOR_NAME],
    );
    await client.query(
      `insert into professor_courses
         (professor_id, instructor_person_id, course_code)
       values ($1, $2, $3)
       on conflict (professor_id, course_code) do update set
         instructor_person_id = excluded.instructor_person_id`,
      [LEGACY_PROFESSOR_ID, PERSON_ID, COURSE_CODE],
    );
  });
});

test.afterAll(async () => {
  await withDatabase(async (client) => {
    await client.query(
      `delete from course_reviews
       where course_code = $1
         and user_id = (select id from users where email = $2)`,
      [COURSE_CODE, "contributor@test.com"],
    );
    await client.query(
      `delete from course_ratings
       where course_code = $1
         and user_id = (select id from users where email = $2)`,
      [COURSE_CODE, "contributor@test.com"],
    );
    await client.query(
      "delete from professor_courses where professor_id = $1",
      [LEGACY_PROFESSOR_ID],
    );
    await client.query("delete from professors where id = $1", [
      LEGACY_PROFESSOR_ID,
    ]);
    await client.query("delete from course_instructors where person_id = $1", [
      PERSON_ID,
    ]);
    await client.query("delete from staff_people where id = $1", [PERSON_ID]);
    await client.query("delete from staff_organisations where id = $1", [
      DEPARTMENT_ID,
    ]);
    await client.query("delete from staff_organisations where id = $1", [
      FACULTY_ID,
    ]);
  });
});

test("searches a professor, opens the card, and binds a course review", async ({
  page,
}, testInfo) => {
  await loginWithPassword(page, "contributor@test.com", "password123");
  await page.goto("/courses");
  await page.getByRole("link", { name: "教授" }).click();

  await page.getByRole("searchbox", { name: "搜索教授" }).fill(COURSE_CODE);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("找到 1 位教授")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: PROFESSOR_NAME }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("professor-directory.png"),
    fullPage: true,
    caret: "initial",
  });

  await page
    .getByRole("link", { name: `查看 ${PROFESSOR_NAME} 的教授测评` })
    .click();
  await expect(
    page.getByRole("heading", { name: PROFESSOR_NAME }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^院系主页/ })).toHaveAttribute(
    "href",
    PROFILE_URL,
  );
  await expect(
    page.getByText("Department of Computer Science and Engineering"),
  ).toBeVisible();
  await expect(page.getByText(COURSE_CODE, { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("professor-detail.png"),
    fullPage: true,
    caret: "initial",
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: testInfo.outputPath("professor-detail-mobile.png"),
    fullPage: true,
    caret: "initial",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: testInfo.outputPath("professor-detail-dark.png"),
    fullPage: true,
    caret: "initial",
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.getByRole("link", { name: "写评价" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/${COURSE_CODE}\\?professor=${PUBLIC_ID}`),
  );
  const professorField = page.getByRole("group", { name: "任课教授" });
  await expect(
    professorField.getByText(PROFESSOR_NAME, { exact: true }),
  ).toBeVisible();
  await expect(
    professorField.getByText("已绑定", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "返回教授详情" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `移除 ${PROFESSOR_NAME}` }),
  ).toHaveCount(0);

  await page.getByLabel("学年").selectOption({ index: 1 });
  await page.getByLabel("学期").selectOption("Term 2");
  await page.getByRole("radio", { name: "4.5 星" }).click();
  await page
    .getByPlaceholder("分享课程内容、功课量或考试体验…")
    .fill("E2E canonical professor review");
  await page.getByRole("button", { name: "提交测评" }).click();
  await expect(page.getByText("我的课程测评")).toBeVisible();

  await expect
    .poll(async () => {
      let rowCount = 0;
      await withDatabase(async (client) => {
        const result = await client.query<{ count: string }>(
          `select count(*)::text count
           from course_rating_professors selected
           join course_ratings rating on rating.id = selected.rating_id
           join users account on account.id = rating.user_id
           where rating.course_code = $1
             and account.email = $2
             and selected.instructor_person_id = $3
             and selected.professor_id is null`,
          [COURSE_CODE, "contributor@test.com", PERSON_ID],
        );
        rowCount = Number(result.rows[0]?.count ?? 0);
      });
      return rowCount;
    })
    .toBe(1);
});
