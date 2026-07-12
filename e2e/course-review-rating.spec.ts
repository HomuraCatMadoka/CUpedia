import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";

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

test.afterEach(async () => {
  await query("delete from course_ratings where course_code = 'CSCI1130'");
});

test("#266 public rating prompt and authenticated aggregate lifecycle", async ({
  page,
  browser,
}) => {
  await page.goto("/courses/CSCI1130");
  const ratingPanel = page
    .locator("section")
    .filter({ hasText: "给这门课打分" });
  await expect(ratingPanel.getByRole("link", { name: "登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交评分" })).toHaveCount(0);

  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/courses/CSCI1130");

  await page.getByRole("button", { name: "9.0" }).click();
  await page.getByRole("button", { name: "提交评分" }).click();
  await expect(page.getByText("你的评分：9.0 分（可更新）")).toBeVisible();
  await expect(page.getByText("已有 1 次评分，综合 9.0 分")).toBeVisible();

  await page.getByRole("button", { name: "8.0" }).click();
  await page.getByRole("button", { name: "提交评分" }).click();
  await expect(page.getByText(/An error occurred/)).toBeVisible();
  await expect(page.getByText("你的评分：9.0 分（可更新）")).toBeVisible();

  let result = await query<{ score: number }>(
    `select score from course_ratings r
     join users u on u.id = r.user_id
     where r.course_code = 'CSCI1130' and u.email = 'user@test.com'`,
  );
  expect(result.rows).toEqual([{ score: 9 }]);

  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await loginWithPassword(contributor, "contributor@test.com", "password123");
  await contributor.goto("/courses/CSCI1130");
  await contributor.getByRole("button", { name: "7.0" }).click();
  await contributor.getByRole("button", { name: "提交评分" }).click();
  await expect(
    contributor.getByText("已有 2 次评分，综合 8.0 分"),
  ).toBeVisible();
  await contributorContext.close();

  await query(
    `update course_ratings set created_at = now() - interval '6 minutes'
     where course_code = 'CSCI1130' and user_id =
       (select id from users where email = 'user@test.com')`,
  );
  await page.reload();
  await page.getByRole("button", { name: "8.0" }).click();
  await page.getByRole("button", { name: "提交评分" }).click();
  await expect(page.getByText("已有 2 次评分，综合 7.5 分")).toBeVisible();
  await expect(page.getByText("你的评分：8.0 分（可更新）")).toBeVisible();

  result = await query<{ score: number }>(
    "select score from course_ratings where course_code = 'CSCI1130' order by score",
  );
  expect(result.rows).toEqual([{ score: 7 }, { score: 8 }]);
});
