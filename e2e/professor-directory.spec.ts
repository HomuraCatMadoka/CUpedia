import { Client } from "pg";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./helpers/auth";
import { expectBottomSheetViewportToStayStill } from "./helpers/mobile-bottom-sheet";

const PERSON_ID = "e2e-professor-directory-person";
const PUBLIC_ID = "7a7ca8c9-1dd2-4b06-8ff9-d55b64d7f7b5";
const PROFESSOR_NAME = "Professor CHAN Tai Man";
const RENDERED_PROFESSOR_NAME = "Prof. Chan Tai Man";
const FACULTY_ID = "e2e-professor-directory-faculty";
const DEPARTMENT_ID = "e2e-professor-directory-department";
const COURSE_CODE = "CSCI1130";
const UNLISTED_COURSE_CODE = "E2E9999";
const PROFILE_URL = "https://www.cse.cuhk.edu.hk/people/e2e-chan";
const LEGACY_PROFESSOR_ID = "e2e-professor-directory-legacy";
const SECOND_PERSON_ID = "e2e-professor-directory-same-name";
const SECOND_PUBLIC_ID = "8b8db9da-2ee3-4c17-9aa0-e66c75e8a8c6";
const SECOND_DEPARTMENT_ID = "e2e-professor-directory-mathematics";
const SECOND_PROFILE_URL = "https://www.math.cuhk.edu.hk/people/e2e-chan";
const MULTI_DEPARTMENT_ID = "e2e-professor-directory-statistics";
const SCHOOL_PERSON_ID = "e2e-professor-directory-school-person";
const SCHOOL_PUBLIC_ID = "9c9ecaeb-3ff4-4d28-8bb1-f77d86f9b9d7";
const SCHOOL_ID = "e2e-professor-directory-school";
const SCHOOL_PROFESSOR_NAME = "Professor WONG Sau Lan";
const RENDERED_SCHOOL_PROFESSOR_NAME = "Prof. Wong Sau Lan";
const SCHOOL_PROFILE_URL = "https://www.pharmacy.cuhk.edu.hk/people/e2e-school";
const UNITARY_FACULTY_ID = "e2e-professor-directory-unitary-faculty";
const DIRECTORY_PERSON_IDS = [PERSON_ID, SECOND_PERSON_ID, SCHOOL_PERSON_ID];
const DIRECTORY_ORGANISATION_IDS = [
  DEPARTMENT_ID,
  SECOND_DEPARTMENT_ID,
  MULTI_DEPARTMENT_ID,
  SCHOOL_ID,
  FACULTY_ID,
  UNITARY_FACULTY_ID,
];

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
         ($2, 'Department of Computer Science and Engineering', 'department', 'https://www.cse.cuhk.edu.hk/e2e', 'e2e'),
         ($3, 'Department of Mathematics', 'department', 'https://www.math.cuhk.edu.hk/e2e', 'e2e'),
         ($4, 'Department of Statistics and Data Science', 'department', 'https://www.sta.cuhk.edu.hk/e2e', 'e2e'),
         ($5, 'School of Pharmacy', 'school', 'https://www.pharmacy.cuhk.edu.hk/e2e', 'e2e'),
         ($6, 'Faculty of Law', 'faculty', 'https://www.law.cuhk.edu.hk/e2e', 'e2e')
       on conflict (id) do update set name = excluded.name`,
      [
        FACULTY_ID,
        DEPARTMENT_ID,
        SECOND_DEPARTMENT_ID,
        MULTI_DEPARTMENT_ID,
        SCHOOL_ID,
        UNITARY_FACULTY_ID,
      ],
    );
    await client.query(
      `update staff_organisations
       set parent_id = $1, faculty_id = $1
       where id = $2`,
      [FACULTY_ID, DEPARTMENT_ID],
    );
    await client.query(
      `insert into staff_people (id, canonical_name, source, identity_kind)
       values
         ($1, $2, 'e2e', 'official'),
         ($3, $2, 'e2e', 'official'),
         ($4, $5, 'e2e', 'official')
       on conflict (id) do update set
         canonical_name = excluded.canonical_name,
         identity_kind = excluded.identity_kind`,
      [
        PERSON_ID,
        PROFESSOR_NAME,
        SECOND_PERSON_ID,
        SCHOOL_PERSON_ID,
        SCHOOL_PROFESSOR_NAME,
      ],
    );
    await client.query(
      `insert into course_instructors (person_id, public_id)
       values ($1, $2), ($3, $4), ($5, $6)
       on conflict (person_id) do update set public_id = excluded.public_id`,
      [
        PERSON_ID,
        PUBLIC_ID,
        SECOND_PERSON_ID,
        SECOND_PUBLIC_ID,
        SCHOOL_PERSON_ID,
        SCHOOL_PUBLIC_ID,
      ],
    );
    await client.query(
      `insert into staff_organisation_affiliations
         (person_id, organisation_id, source_url)
       values
         ($1, $2, $7), ($1, $3, $7), ($1, $4, $7),
         ($5, $6, $8), ($9, $10, $11), ($9, $12, $13)
       on conflict (person_id, organisation_id) do update set is_current = true`,
      [
        PERSON_ID,
        FACULTY_ID,
        DEPARTMENT_ID,
        MULTI_DEPARTMENT_ID,
        SECOND_PERSON_ID,
        SECOND_DEPARTMENT_ID,
        PROFILE_URL,
        SECOND_PROFILE_URL,
        SCHOOL_PERSON_ID,
        SCHOOL_ID,
        SCHOOL_PROFILE_URL,
        UNITARY_FACULTY_ID,
        "https://www.law.cuhk.edu.hk/e2e",
      ],
    );
    await client.query(
      `insert into staff_person_sources
         (person_id, source, source_key, profile_url, role_label,
          appointment_kind, profile_verified_at, source_url)
       values
         ($1, 'cuhk_department:cse', 'e2e-chan', $2,
          'Professor', 'regular', now(), $2),
         ($3, 'cuhk_department:math', 'e2e-chan-math', $4,
          'Professor', 'regular', now(), $4),
         ($5, 'cuhk_department:pharmacy', 'e2e-school', $6,
          'Professor', 'regular', now(), $6)
       on conflict (source, source_key) do update set
         person_id = excluded.person_id,
         profile_url = excluded.profile_url,
         profile_verified_at = excluded.profile_verified_at,
         is_current = true`,
      [
        PERSON_ID,
        PROFILE_URL,
        SECOND_PERSON_ID,
        SECOND_PROFILE_URL,
        SCHOOL_PERSON_ID,
        SCHOOL_PROFILE_URL,
      ],
    );
    await client.query(
      `insert into staff_aliases (person_id, alias, normalized_alias, source)
       values ($1, '測試陳', '測試陳', 'e2e')
       on conflict (person_id, alias) do update set
         normalized_alias = excluded.normalized_alias`,
      [PERSON_ID],
    );
    await client.query(
      `insert into staff_teaching_assignments
         (person_id, academic_year, term, course_code, captured_at)
       select $1,
         case
           when code in ('CSCI1120', 'CSCI1130', 'CSCI2100', 'CSCI2720',
                         'CSCI3130', 'CSCI3230', 'CSCI4180') then '2025-26'
           when code in ('ENGG2020', 'MATH1030') then '2023-24'
           else '2021-22'
         end,
         'Term 1', code, now()
       from courses
       on conflict do nothing`,
      [PERSON_ID],
    );
    await client.query(
      `insert into course_ratings
         (course_code, user_id, score, academic_year, term,
          instructor_person_id, professor_name_snapshot)
       select 'CSCI2100', id, 4.5, '2025-26', 'Term 1', $1, $2
       from users where email = 'user@test.com'
       on conflict (course_code, user_id) do update set
         score = excluded.score,
         instructor_person_id = excluded.instructor_person_id,
         professor_name_snapshot = excluded.professor_name_snapshot`,
      [PERSON_ID, PROFESSOR_NAME],
    );
    await client.query(
      `insert into professors (id, name, search_text)
       values ($1, $2, lower($2))
       on conflict (id) do update set name = excluded.name`,
      [LEGACY_PROFESSOR_ID, PROFESSOR_NAME],
    );
    await client.query(
      `insert into courses (code, subject, title, units, description)
       values ($1, 'E2E', 'Previously Unlisted Professor Course', '3', '')
       on conflict (code) do update set title = excluded.title`,
      [UNLISTED_COURSE_CODE],
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
      `delete from course_ratings
       where course_code = 'CSCI2100'
         and instructor_person_id = $1
         and user_id = (select id from users where email = 'user@test.com')`,
      [PERSON_ID],
    );
    await client.query(
      "delete from professor_courses where professor_id = $1",
      [LEGACY_PROFESSOR_ID],
    );
    await client.query("delete from courses where code = $1", [
      UNLISTED_COURSE_CODE,
    ]);
    await client.query("delete from professors where id = $1", [
      LEGACY_PROFESSOR_ID,
    ]);
    await client.query(
      "delete from course_instructors where person_id = any($1::text[])",
      [DIRECTORY_PERSON_IDS],
    );
    await client.query("delete from staff_people where id = any($1::text[])", [
      DIRECTORY_PERSON_IDS,
    ]);
    await client.query(
      "delete from staff_organisations where id = any($1::text[])",
      [DIRECTORY_ORGANISATION_IDS],
    );
  });
});

test("ignores a stale department filter instead of showing an empty directory", async ({
  page,
}) => {
  await page.goto(
    "/professors?q=%20%20&department=department-that-no-longer-exists",
  );

  await expect(
    page.getByRole("heading", { name: RENDERED_PROFESSOR_NAME }),
  ).toHaveCount(2);
  await expect(page.getByText(/全部 \d+ 位教授/)).toBeVisible();
  await expect(page.getByRole("link", { name: "清除筛选" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "按学系或学院筛选" }),
  ).toContainText("全部学系");
});

test("keeps same-name professors distinct and scopes autocomplete by department", async ({
  page,
}) => {
  await page.goto("/professors");
  const professorSearch = page.getByRole("combobox", { name: "搜索教授" });
  await professorSearch.fill("CHAN Tai");
  await expect(
    page.getByRole("option", { name: RENDERED_PROFESSOR_NAME }),
  ).toHaveCount(2);

  await professorSearch.fill("");
  await expect(
    page.getByRole("option", { name: RENDERED_PROFESSOR_NAME }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "按学系或学院筛选" }).click();
  await page.getByPlaceholder("搜索学系或学院…").fill("Mathematics");
  await page.getByRole("option", { name: /Department of Mathematics/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`department=${SECOND_DEPARTMENT_ID}`),
  );
  await expect(page.getByText("找到 1 位教授")).toBeVisible();

  await professorSearch.fill("CHAN Tai");
  const scopedMatch = page.getByRole("option", {
    name: RENDERED_PROFESSOR_NAME,
  });
  await expect(scopedMatch).toHaveCount(1);
  await expect(scopedMatch).toContainText("Department of Mathematics");
  await scopedMatch.click();
  await expect(page).toHaveURL(new RegExp(`/professors/${SECOND_PUBLIC_ID}`));
});

test("finds aliases without duplicating a professor with multiple affiliations", async ({
  page,
}) => {
  await page.goto("/professors");
  const professorSearch = page.getByRole("combobox", { name: "搜索教授" });

  await professorSearch.fill("測試陳");
  const aliasMatch = page.getByRole("option", {
    name: RENDERED_PROFESSOR_NAME,
  });
  await expect(aliasMatch).toHaveCount(1);

  await professorSearch.fill("");
  await page.getByRole("button", { name: "按学系或学院筛选" }).click();
  await page.getByPlaceholder("搜索学系或学院…").fill("Statistics");
  await page
    .getByRole("option", { name: /Department of Statistics and Data Science/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`department=${MULTI_DEPARTMENT_ID}`));

  await expect(page.getByText("找到 1 位教授")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: RENDERED_PROFESSOR_NAME }),
  ).toHaveCount(1);
  await professorSearch.fill("測試陳");
  await expect(aliasMatch).toHaveCount(1);
});

test("includes professors affiliated only with a school", async ({ page }) => {
  await page.goto("/professors");
  await page.getByRole("button", { name: "按学系或学院筛选" }).click();
  await page.getByPlaceholder("搜索学系或学院…").fill("Pharmacy");
  await page.getByRole("option", { name: /School of Pharmacy/ }).click();
  await expect(page).toHaveURL(new RegExp(`department=${SCHOOL_ID}`));

  await expect(page.getByText("找到 1 位教授")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: RENDERED_SCHOOL_PROFESSOR_NAME }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`department=${SCHOOL_ID}`));
});

test("includes a unitary faculty but excludes faculties with teaching units", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/professors");
  await page.getByRole("button", { name: "按学系或学院筛选" }).click();
  const organisationSearch = page.getByPlaceholder("搜索学系或学院…");

  await organisationSearch.fill("Faculty of Engineering");
  await expect(
    page.getByRole("option", { name: /Faculty of Engineering/ }),
  ).toHaveCount(0);

  await organisationSearch.fill("Faculty of Law");
  await page.getByRole("option", { name: /Faculty of Law/ }).click();
  await expect(page).toHaveURL(new RegExp(`department=${UNITARY_FACULTY_ID}`));
  await expect(page.getByText("找到 1 位教授")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: RENDERED_SCHOOL_PROFESSOR_NAME }),
  ).toBeVisible();
});

test("applies sorting and review filters immediately", async ({ page }) => {
  await page.goto("/professors");

  await page.getByRole("button", { name: /排序.*评价最多/ }).click();
  await page.getByRole("menuitem", { name: "姓名 A-Z" }).click();
  await expect(page).toHaveURL(/sort=name/);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page.getByRole("radio", { name: "只看有评价" }).click();
  await expect(page).toHaveURL(/rated=1/);
  await expect(
    page.getByRole("button", { name: "筛选 · 1", exact: true }),
  ).toBeVisible();
});

test("shows three professor cards in one row on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/professors");

  const cards = page.locator("main article");
  await expect(cards).toHaveCount(3);
  const cardTops = await cards.evaluateAll((items) =>
    items.map((item) => Math.round(item.getBoundingClientRect().top)),
  );
  expect(new Set(cardTops).size).toBe(1);
});

test("mobile directory drawers do not scroll their viewport while opening", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 667 });

  await page.goto("/professors");
  await expectBottomSheetViewportToStayStill(page, {
    triggerName: "按学系或学院筛选",
    viewportTestId: "mobile-professor-department-viewport",
    closeName: "关闭学系选择",
  });
  await expectBottomSheetViewportToStayStill(page, {
    triggerName: "筛选",
    viewportTestId: "mobile-professor-filter-viewport",
    closeName: "关闭教授筛选",
  });
});

test("scrolls the professor course picker on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`/professors/${PUBLIC_ID}`);
  await page.getByRole("button", { name: /查看全部 \d+ 门并搜索课程/ }).click();

  const dialog = page.getByRole("dialog", { name: "选择课程评价" });
  const results = dialog
    .getByRole("heading", { name: "目前收录" })
    .locator("../..")
    .locator("..");

  await expect
    .poll(() =>
      results.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    )
    .toBeGreaterThan(0);

  await results.hover();
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => results.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test("mobile professor search matches course search without triggering iOS focus zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 851 });

  await page.goto("/courses");
  const courseSearch = page.getByRole("searchbox", { name: "搜索课程" });
  const courseSearchMetrics = await courseSearch.evaluate((element) => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    height: element.getBoundingClientRect().height,
  }));

  await page.goto("/professors");
  const professorSearch = page.getByRole("combobox", { name: "搜索教授" });
  const professorSearchMetrics = await professorSearch.evaluate((element) => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    height: element
      .closest('[data-slot="input-group"]')!
      .getBoundingClientRect().height,
  }));

  expect(professorSearchMetrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(professorSearchMetrics.fontSize).toBe(courseSearchMetrics.fontSize);
  expect(professorSearchMetrics.height).toBe(courseSearchMetrics.height);
});

test("searches a professor, opens the card, and binds a course review", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await loginWithPassword(page, "contributor@test.com", "password123");
  await page.goto("/courses");
  await page.getByRole("link", { name: "教授" }).click();

  await page.getByRole("button", { name: "按学系或学院筛选" }).click();
  await page.getByPlaceholder("搜索学系或学院…").fill("Computer Science");
  await page
    .getByRole("option", {
      name: /Department of Computer Science and Engineering/,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`department=${DEPARTMENT_ID}`));
  await expect(page.getByText("找到 1 位教授")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: RENDERED_PROFESSOR_NAME }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "搜索教授" }).fill("CHAN Tai");
  await expect(
    page.getByRole("option", { name: RENDERED_PROFESSOR_NAME }),
  ).toBeVisible();
  await page.goto(`/professors/${PUBLIC_ID}`);
  await expect(
    page.getByRole("heading", { name: RENDERED_PROFESSOR_NAME }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^院系主页/ })).toHaveAttribute(
    "href",
    PROFILE_URL,
  );
  await expect(
    page.getByText("Department of Computer Science and Engineering"),
  ).toBeVisible();
  await expect(page.getByText(COURSE_CODE, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "选择课程评价" }).click();
  await expect(
    page.getByRole("dialog", { name: "选择课程评价" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "关闭课程选择" }),
  ).toBeFocused();
  await expect(page).toHaveURL(/chooseCourse=1/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/chooseCourse=1/);
  await page.getByRole("button", { name: /查看全部 \d+ 门并搜索课程/ }).click();
  await page
    .getByRole("searchbox", { name: "搜索课程代码或名称" })
    .fill(UNLISTED_COURSE_CODE);
  const unlistedCourseLink = page.getByRole("link", {
    name: `评价 ${UNLISTED_COURSE_CODE}`,
  });
  await expect(unlistedCourseLink).toBeVisible();
  await expect(unlistedCourseLink).toHaveAttribute(
    "href",
    new RegExp(`/courses/${UNLISTED_COURSE_CODE}\\?professor=${PUBLIC_ID}`),
  );
  await unlistedCourseLink.click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/${UNLISTED_COURSE_CODE}\\?professor=${PUBLIC_ID}`),
  );
  const unlistedProfessorField = page.getByRole("group", { name: "任课教授" });
  await expect(
    unlistedProfessorField.getByText(RENDERED_PROFESSOR_NAME, { exact: true }),
  ).toBeVisible();
  await expect(
    unlistedProfessorField.getByText("已绑定", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `移除 ${RENDERED_PROFESSOR_NAME}` }),
  ).toHaveCount(0);

  await page.goto(`/professors/${PUBLIC_ID}`);

  await page.getByRole("link", { name: `评价 ${COURSE_CODE}` }).click();
  await expect(page).toHaveURL(
    new RegExp(`/courses/${COURSE_CODE}\\?professor=${PUBLIC_ID}`),
  );
  const professorField = page.getByRole("group", { name: "任课教授" });
  await expect(
    professorField.getByText(RENDERED_PROFESSOR_NAME, { exact: true }),
  ).toBeVisible();
  await expect(
    professorField.getByText("已绑定", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "返回教授详情" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `移除 ${RENDERED_PROFESSOR_NAME}` }),
  ).toHaveCount(0);

  await page.getByLabel("学年").selectOption({ index: 1 });
  await page.getByLabel("学期").selectOption("Term 2");
  await page.getByRole("radio", { name: "4.5 星" }).click();
  await page
    .getByPlaceholder("分享课程内容、功课量或考试体验…")
    .fill("E2E canonical professor review");
  await page.getByRole("button", { name: "提交测评" }).click();

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
  await page.reload();
  await expect(
    page
      .getByRole("listitem")
      .getByText("E2E canonical professor review", { exact: true }),
  ).toBeVisible();
});
