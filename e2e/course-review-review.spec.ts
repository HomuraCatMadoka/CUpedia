import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginWithPassword } from "./helpers/auth";

const contents: string[] = [];

async function cleanup() {
  if (!contents.length) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from course_reviews where content = any($1)", [
      contents,
    ]);
  } finally {
    await client.end();
  }
}

test.afterEach(cleanup);

test("#266 anonymous review, like toggle, author and admin withdrawal", async ({
  page,
  browser,
}) => {
  const own = `review-${randomUUID()}`;
  const moderated = `review-${randomUUID()}`;
  contents.push(own, moderated);

  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/courses/CSCI1130");
  const textarea = page.getByPlaceholder("匿名分享你对这门课的看法…");

  await textarea.fill(own);
  await page.getByRole("button", { name: "发表评论" }).click();
  const ownReview = page.getByRole("listitem").filter({ hasText: own });
  await expect(ownReview.getByText("匿名用户")).toBeVisible();
  const like = ownReview.getByTitle("点赞");
  await like.click();
  await expect(like).toContainText("1");
  await like.click();
  await expect(like).toContainText("0");
  await ownReview.getByTitle("撤回我的评论").click();
  await expect(page.getByText(own)).toHaveCount(0);

  await textarea.fill(moderated);
  await page.getByRole("button", { name: "发表评论" }).click();
  await expect(page.getByText(moderated)).toBeVisible();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await loginAsAdmin(admin);
  await admin.goto("/courses/CSCI1130");
  const target = admin.getByRole("listitem").filter({ hasText: moderated });
  await target.getByTitle("撤回我的评论").click();
  await expect(admin.getByText(moderated)).toHaveCount(0);
  await adminContext.close();
});
