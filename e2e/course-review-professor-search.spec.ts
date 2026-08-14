import { Client } from "pg";
import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";

const PROFESSORS = [
  {
    id: "e2e-professor-legacy",
    personId: "e2e-person-legacy",
    name: "Professor LEGACY Wong",
  },
  {
    id: "e2e-professor-chan-wing-kai",
    personId: "e2e-person-chan-wing-kai",
    name: "Professor CHAN Wing Kai",
  },
  {
    id: "e2e-professor-kai",
    personId: "e2e-person-kai",
    name: "Professor KAI",
  },
  {
    id: "e2e-professor-jose-garcia",
    personId: "e2e-person-jose-garcia",
    name: "Professor José García",
  },
  {
    id: "e2e-professor-chen-weiwen",
    personId: "e2e-person-chen-weiwen",
    name: "测试教授 陈伟文",
  },
] as const;
const RENDERED_LEGACY = "Prof. Legacy Wong";
const RENDERED_CHAN = "Prof. Chan Wing Kai";
const RENDERED_KAI = "Prof. Kai";
const USER_EMAIL = "contributor@test.com";
const COURSE_CODE = "CSCI1130";

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
    for (const professor of PROFESSORS) {
      await client.query(
        `insert into professors (id, name, search_text)
         values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, search_text = excluded.search_text`,
        [professor.id, professor.name, professor.name.toLowerCase()],
      );
      await client.query(
        `insert into staff_people (id, canonical_name, source, identity_kind)
         values ($1, $2, 'e2e', 'official')
         on conflict (id) do update set canonical_name = excluded.canonical_name`,
        [professor.personId, professor.name],
      );
      await client.query(
        `insert into professor_staff_identities
           (professor_id, person_id, match_method, source_url)
         values ($1, $2, 'manual_override', 'e2e')
         on conflict (professor_id) do update set person_id = excluded.person_id`,
        [professor.id, professor.personId],
      );
      await client.query(
        `insert into course_instructors (person_id)
         values ($1)
         on conflict (person_id) do nothing`,
        [professor.personId],
      );
    }
  });
});

test.afterAll(async () => {
  await withDatabase(async (client) => {
    await client.query(
      `delete from course_reviews
       where course_code = $1
         and user_id = (select id from users where email = $2)`,
      [COURSE_CODE, USER_EMAIL],
    );
    await client.query(
      `delete from course_ratings
       where course_code = $1
         and user_id = (select id from users where email = $2)`,
      [COURSE_CODE, USER_EMAIL],
    );
    await client.query("delete from professors where id = any($1::text[])", [
      PROFESSORS.map(({ id }) => id),
    ]);
    await client.query(
      "delete from course_instructors where person_id = any($1::text[])",
      [PROFESSORS.map(({ personId }) => personId)],
    );
    await client.query("delete from staff_people where id = any($1::text[])", [
      PROFESSORS.map(({ personId }) => personId),
    ]);
  });
});

test("official professor outside the course assignment can be searched and submitted", async ({
  page,
}) => {
  await loginWithPassword(page, USER_EMAIL, "password123");
  await page.goto(`/courses/${COURSE_CODE}`);

  await page.getByRole("link", { name: "写测评" }).click();
  await page.getByLabel("学年").selectOption("2025-26");
  await page.getByLabel("学期").selectOption("Term 2");

  const professorSearch = page.getByRole("combobox", {
    name: "搜索任课教授",
  });

  await professorSearch.fill("kai chna");
  await expect(page.getByRole("option", { name: RENDERED_CHAN })).toBeVisible();
  await expect(
    page.getByRole("option", { name: RENDERED_KAI, exact: true }),
  ).toHaveCount(0);

  await professorSearch.fill("陈伟文");
  await expect(
    page.getByRole("option", { name: "测试教授 陈伟文" }),
  ).toBeVisible();

  await professorSearch.fill("ＣＨＡＮ");
  await expect(page.getByRole("option", { name: RENDERED_CHAN })).toBeVisible();

  await professorSearch.fill("jose garcia");
  await expect(
    page.getByRole("option", { name: "Prof. José García" }),
  ).toBeVisible();

  await professorSearch.fill("Legacy Wong");
  await expect(
    page.getByRole("option", { name: RENDERED_LEGACY }),
  ).toBeVisible();
  await professorSearch.press("Enter");
  await professorSearch.fill("CHAN Wing Kai");
  await page.getByRole("option", { name: RENDERED_CHAN }).click();
  await expect(page.getByText("已选择 2 位教授")).toBeVisible();
  await page.getByRole("radio", { name: "4 星", exact: true }).click();
  await page.getByRole("button", { name: "提交测评" }).click();

  await expect(page.getByText("课程测评已发布")).toBeVisible();
  await expect(
    page.locator("section").filter({ hasText: "我的课程测评" }),
  ).toContainText(RENDERED_LEGACY);
  await expect(
    page.locator("section").filter({ hasText: "我的课程测评" }),
  ).toContainText(RENDERED_CHAN);

  await withDatabase(async (client) => {
    const rating = await client.query<{
      professor_id: string;
      instructor_person_id: string;
    }>(
      `select professor_id, instructor_person_id
       from course_ratings
       where course_code = $1
         and user_id = (select id from users where email = $2)`,
      [COURSE_CODE, USER_EMAIL],
    );
    expect(rating.rows).toEqual([
      {
        professor_id: PROFESSORS[0].id,
        instructor_person_id: PROFESSORS[0].personId,
      },
    ]);
  });

  const professorFilter = page.getByLabel("按任课教授筛选");
  await expect(
    professorFilter.locator(`option[value="${PROFESSORS[1].personId}"]`),
  ).toHaveText(RENDERED_CHAN);
  await professorFilter.selectOption(PROFESSORS[1].personId);
  await expect(page.getByTestId("professor-rating-summary")).toContainText(
    "4.0",
  );

  await page.getByRole("button", { name: "编辑" }).click();
  await expect(
    page.getByRole("button", { name: `移除 ${RENDERED_LEGACY}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `移除 ${RENDERED_CHAN}` }),
  ).toBeVisible();
});
