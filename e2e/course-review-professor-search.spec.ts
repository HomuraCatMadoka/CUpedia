import { Client } from "pg";
import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";

const PROFESSORS = [
  {
    id: "e2e-professor-legacy",
    name: "Professor LEGACY Wong",
  },
  {
    id: "e2e-professor-chan-wing-kai",
    name: "Professor CHAN Wing Kai",
  },
  {
    id: "e2e-professor-kai",
    name: "Professor KAI",
  },
  {
    id: "e2e-professor-jose-garcia",
    name: "Professor José García",
  },
  {
    id: "e2e-professor-chen-weiwen",
    name: "测试教授 陈伟文",
  },
] as const;
const PROFESSOR_NAME = PROFESSORS[0].name;
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
  });
});

test("official professor outside the course assignment can be searched and submitted", async ({
  page,
}) => {
  await loginWithPassword(page, USER_EMAIL, "password123");
  await page.goto(`/courses/${COURSE_CODE}`);

  await page.getByLabel("学年").selectOption("2025-26");
  await page.getByLabel("学期").selectOption("Term 2");

  const professorSearch = page.getByPlaceholder("搜索任课教授姓名");

  await professorSearch.fill("kai chna");
  await expect(
    page.getByRole("button", { name: "Professor CHAN Wing Kai" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Professor KAI", exact: true }),
  ).toHaveCount(0);

  await professorSearch.fill("陈伟文");
  await expect(
    page.getByRole("button", { name: "测试教授 陈伟文" }),
  ).toBeVisible();

  await professorSearch.fill("ＣＨＡＮ");
  await expect(
    page.getByRole("button", { name: "Professor CHAN Wing Kai" }),
  ).toBeVisible();

  await professorSearch.fill("jose garcia");
  await expect(
    page.getByRole("button", { name: "Professor José García" }),
  ).toBeVisible();

  await professorSearch.fill("Legacy Wong");
  await page.getByRole("button", { name: PROFESSOR_NAME }).click();
  await page.getByRole("radio", { name: "4 星", exact: true }).click();
  await page.getByRole("button", { name: "提交测评" }).click();

  await expect(page.getByText("课程测评已发布")).toBeVisible();
  await expect(
    page.locator("section").filter({ hasText: "我的课程测评" }),
  ).toContainText(PROFESSOR_NAME);
});
