import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";

test("#266 rating updates aggregate and enforces cooldown", async ({
  page,
}) => {
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

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ score: number }>(
      `select score from course_ratings r
       join users u on u.id = r.user_id
       where r.course_code = 'CSCI1130' and u.email = 'user@test.com'`,
    );
    expect(result.rows).toEqual([{ score: 9 }]);
  } finally {
    await client.end();
  }
});
