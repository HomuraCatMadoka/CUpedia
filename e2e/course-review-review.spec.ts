import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, loginWithPassword } from "./helpers/auth";
import { selectSeedProfessor } from "./helpers/course-review";

const contents: string[] = [];

async function cleanup() {
  if (!contents.length) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from course_reviews where content = any($1)", [
      contents,
    ]);
    await client.query(
      "delete from course_ratings where course_code = 'CSCI1130'",
    );
  } finally {
    await client.end();
  }
}

async function fillSubmission(page: Page, content: string) {
  await page.getByLabel("学年").selectOption("2025-26");
  await page.getByLabel("学期").selectOption("Term 2");
  await selectSeedProfessor(page);
  await page.getByRole("radio", { name: "4.5 星" }).click();
  await page.getByPlaceholder("分享课程内容、功课量或考试体验…").fill(content);
}

async function countRows(
  table: "course_ratings" | "course_reviews" | "course_review_likes",
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const query =
      table === "course_review_likes"
        ? `select count(*)::int as count from course_review_likes l
           join course_reviews r on r.id = l.review_id
           where r.course_code = 'CSCI1130'`
        : `select count(*)::int as count from ${table}
           where course_code = 'CSCI1130'`;
    const result = await client.query<{ count: number }>(query);
    return result.rows[0].count;
  } finally {
    await client.end();
  }
}

async function createRatingOnly(email: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into course_ratings
         (course_code, user_id, score, academic_year, term, professor_id, professor_name_snapshot)
       select 'CSCI1130', u.id, 4, '2025-26', 'Term 2', p.id, p.name
       from users u
       cross join lateral (
         select professors.id, professors.name
         from professors
         join professor_courses pc on pc.professor_id = professors.id
         where pc.course_code = 'CSCI1130'
         limit 1
       ) p
       where u.email = $1`,
      [email],
    );
  } finally {
    await client.end();
  }
}

async function createReview(email: string, content: string, createdAt: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into course_reviews (course_code, user_id, content, created_at)
       select 'CSCI1130', id, $2, $3
       from users
       where email = $1`,
      [email, content, createdAt],
    );
  } finally {
    await client.end();
  }
}

test.afterEach(cleanup);

test("#294 published submission can be edited, cleared, deleted, and moderated", async ({
  page,
  browser,
}) => {
  const own = `review-${randomUUID()}`;
  const moderated = `review-${randomUUID()}`;
  contents.push(own, moderated);

  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/courses/CSCI1130");

  await fillSubmission(page, own);
  await page.getByRole("button", { name: "提交测评" }).click();
  await expect(page.getByText("课程测评已发布")).toBeVisible();
  const summary = page.locator("section").filter({ hasText: "我的课程测评" });
  await expect(summary).toContainText("4.5");
  await expect(summary).toContainText("2025-26");
  await expect(summary).toContainText("Term 2");
  await expect(summary).toContainText("测试教授 Chan");
  await expect(summary).toContainText("已附署名评论");
  await expect(summary).toContainText(own);
  const attributedReview = page.getByRole("listitem").filter({ hasText: own });
  await expect(attributedReview.getByText("TestUser")).toBeVisible();

  await summary.getByRole("button", { name: "编辑" }).click();
  await expect(
    page.getByRole("checkbox", { name: "匿名发表" }),
  ).not.toBeChecked();
  await expect(page.getByLabel("学年")).toHaveValue("2025-26");
  await expect(page.getByLabel("学期")).toHaveValue("Term 2");
  await expect(page.getByPlaceholder("搜索任课教授姓名")).toHaveValue(
    "测试教授 Chan",
  );
  await expect(page.getByRole("radio", { name: "4.5 星" })).toBeChecked();
  await expect(
    page.getByPlaceholder("分享课程内容、功课量或考试体验…"),
  ).toHaveValue(own);

  await page.getByRole("checkbox", { name: "匿名发表" }).check();
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(summary).toContainText("已附匿名评论");
  await expect(attributedReview.getByText("匿名用户")).toBeVisible();

  await summary.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByRole("checkbox", { name: "匿名发表" })).toBeChecked();
  await page.getByPlaceholder("分享课程内容、功课量或考试体验…").fill("");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("未填写文字评论")).toBeVisible();
  await expect(page.getByText(own)).toHaveCount(0);
  await expect.poll(() => countRows("course_reviews")).toBe(0);
  await expect.poll(() => countRows("course_ratings")).toBe(1);

  page.once("dialog", (dialog) => dialog.accept());
  await summary.getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("button", { name: "提交测评" })).toBeVisible();
  await expect.poll(() => countRows("course_ratings")).toBe(0);

  await fillSubmission(page, moderated);
  await page.getByRole("checkbox", { name: "匿名发表" }).check();
  await page.getByRole("button", { name: "提交测评" }).click();
  const ownReview = page.getByRole("listitem").filter({ hasText: own });
  await expect(ownReview).toHaveCount(0);
  const moderatedReview = page
    .getByRole("listitem")
    .filter({ hasText: moderated });
  await expect(moderatedReview.getByText("匿名用户")).toBeVisible();

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/courses/CSCI1130");
  const publicReview = publicPage
    .getByRole("listitem")
    .filter({ hasText: moderated });
  await expect(publicReview).toBeVisible();
  await expect(publicReview.getByTitle("登录后可点赞")).toBeDisabled();
  await expect(
    publicPage.getByPlaceholder("分享课程内容、功课量或考试体验…"),
  ).toHaveCount(0);
  const reviewSection = publicPage
    .locator("section")
    .filter({ hasText: "提交课程测评" });
  await expect(reviewSection.getByRole("link", { name: "登录" })).toBeVisible();
  await publicContext.close();

  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await loginWithPassword(contributor, "contributor@test.com", "password123");
  await contributor.goto("/courses/CSCI1130");
  const contributedReview = contributor
    .getByRole("listitem")
    .filter({ hasText: moderated });
  await expect(contributedReview.getByTitle("删除整条投稿")).toHaveCount(0);
  const like = contributedReview.getByTitle("点赞");
  await like.click();
  await expect(like).toContainText("1");
  await contributorContext.close();
  await expect.poll(() => countRows("course_review_likes")).toBe(1);

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await loginAsAdmin(admin);
  await admin.goto("/courses/CSCI1130");
  const target = admin.getByRole("listitem").filter({ hasText: moderated });
  admin.once("dialog", (dialog) => dialog.accept());
  await target.getByTitle("删除整条投稿").click();
  await expect(admin.getByText(moderated)).toHaveCount(0);
  await expect.poll(() => countRows("course_reviews")).toBe(0);
  await expect.poll(() => countRows("course_ratings")).toBe(0);
  await expect.poll(() => countRows("course_review_likes")).toBe(0);

  await createRatingOnly("contributor@test.com");
  await admin.reload();
  const ratingOnly = admin
    .getByRole("listitem")
    .filter({ hasText: "仅评分投稿" });
  await expect(ratingOnly).toContainText("4.0");
  admin.once("dialog", (dialog) => dialog.accept());
  await ratingOnly.getByTitle("删除整条投稿").click();
  await expect(ratingOnly).toHaveCount(0);
  await expect.poll(() => countRows("course_ratings")).toBe(0);
  await adminContext.close();
});

test("review cards with different content lengths do not overlap", async ({
  page,
}) => {
  const shortReview = `short-review-${randomUUID()}`;
  const longReview = `long-review-${randomUUID()}-${"很长的课程测评内容".repeat(180)}`;
  contents.push(shortReview, longReview);

  await createReview("user@test.com", shortReview, "2026-01-01T00:00:00Z");
  await createReview(
    "contributor@test.com",
    longReview,
    "2026-01-02T00:00:00Z",
  );

  await page.goto("/courses/CSCI1130");

  const longCard = page.getByRole("listitem").filter({ hasText: longReview });
  const shortCard = page.getByRole("listitem").filter({ hasText: shortReview });
  await expect(longCard).toBeVisible();
  await expect(shortCard).toBeVisible();

  const [longBox, shortBox] = await Promise.all([
    longCard.boundingBox(),
    shortCard.boundingBox(),
  ]);
  expect(longBox).not.toBeNull();
  expect(shortBox).not.toBeNull();
  expect(shortBox!.y).toBeGreaterThanOrEqual(longBox!.y + longBox!.height - 1);
});
