import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

import { loginWithPassword } from "./helpers/auth";
import { selectSeedProfessor } from "./helpers/course-review";

const reviewContents: string[] = [];
const reviewIds: string[] = [];

async function cleanup() {
  if (!reviewContents.length) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (reviewIds.length) {
      await client.query(
        "delete from notifications where metadata->>'reviewId' = any($1)",
        [reviewIds],
      );
    }
    await client.query("delete from course_reviews where content = any($1)", [
      reviewContents,
    ]);
    await client.query(
      "delete from course_ratings where course_code = 'CSCI1130'",
    );
  } finally {
    await client.end();
    reviewContents.length = 0;
    reviewIds.length = 0;
  }
}

async function fillReview(page: Page, content: string) {
  await page.getByLabel("学年").selectOption("2025-26");
  await page.getByLabel("学期").selectOption("Term 2");
  await selectSeedProfessor(page);
  await page.getByRole("radio", { name: "4.5 星" }).click();
  await page.getByPlaceholder("分享课程内容、功课量或考试体验…").fill(content);
}

async function replyCountForReview(content: string): Promise<number> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ count: number }>(
      `select count(*)::int as count
       from course_review_replies reply
       join course_reviews review on review.id = reply.review_id
       where review.content = $1`,
      [content],
    );
    return result.rows[0].count;
  } finally {
    await client.end();
  }
}

async function reviewIdForContent(content: string): Promise<string> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      "select id from course_reviews where content = $1",
      [content],
    );
    return result.rows[0].id;
  } finally {
    await client.end();
  }
}

async function createIdentityLayoutFixture(
  reviewContent: string,
  replyContent: string,
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const review = await client.query<{ id: string }>(
      `insert into course_reviews
         (course_code, user_id, content, academic_year, term, score, is_anonymous)
       select 'CSCI1130', id, $1, '2025-26', 'Term 2', 4.5, false
       from users
       where email = 'user@test.com'
       returning id`,
      [reviewContent],
    );
    await client.query(
      `insert into course_review_replies (review_id, user_id, content)
       select $1, id, $2
       from users
       where email = 'contributor@test.com'`,
      [review.rows[0].id, replyContent],
    );
  } finally {
    await client.end();
  }
}

test.afterEach(cleanup);

test("#445 course review replies stay one level, preserve anonymity, and cascade", async ({
  page,
  browser,
}) => {
  const original = `reply-parent-${randomUUID()}`;
  const edited = `${original}-edited`;
  const anonymousReply = `anonymous-reply-${randomUUID()}`;
  const signedReply = `signed-reply-${randomUUID()}`;
  reviewContents.push(original, edited);

  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/courses/CSCI1130");
  await page.getByRole("button", { name: "开始填写" }).click();
  await fillReview(page, original);
  await page.getByRole("checkbox", { name: "匿名发表" }).check();
  await page.getByRole("button", { name: "提交测评" }).click();

  const review = page.getByRole("listitem").filter({ hasText: original });
  await expect(review).toBeVisible();
  reviewIds.push(await reviewIdForContent(original));
  await review.getByRole("button", { name: "回复 0" }).click();
  const replies = review.getByRole("region", { name: "评论回复" });
  await replies.getByRole("textbox", { name: "回复内容" }).fill(anonymousReply);
  await replies.getByRole("button", { name: "发布回复" }).click();
  await expect(replies.getByText(anonymousReply)).toBeVisible();
  await expect(replies.getByText("匿名用户")).toBeVisible();
  await expect(replies.getByText("TestUser")).toHaveCount(0);
  await expect(replies.getByTitle("点赞")).toHaveCount(0);

  const contributorContext = await browser.newContext();
  const contributor = await contributorContext.newPage();
  await loginWithPassword(contributor, "contributor@test.com", "password123");
  await contributor.goto("/courses/CSCI1130");
  const contributorReview = contributor
    .getByRole("listitem")
    .filter({ hasText: original });
  await contributorReview.getByRole("button", { name: "回复 1" }).click();
  const contributorReplies = contributorReview.getByRole("region", {
    name: "评论回复",
  });
  await contributorReplies
    .getByRole("textbox", { name: "回复内容" })
    .fill(signedReply);
  await contributorReplies.getByRole("button", { name: "发布回复" }).click();
  await expect(contributorReplies.getByText(signedReply)).toBeVisible();
  await expect(contributorReplies.getByText("Contributor")).toBeVisible();
  await expect.poll(() => replyCountForReview(original)).toBe(2);

  contributor.once("dialog", (dialog) => dialog.accept());
  await contributorReplies.getByTitle("删除回复").click();
  await expect(contributorReplies.getByText(signedReply)).toHaveCount(0);
  await expect(
    contributorReview.getByRole("button", { name: "回复 1" }),
  ).toBeVisible();
  await contributorContext.close();

  const summary = page.locator("section").filter({ hasText: "我的课程测评" });
  await summary.getByRole("button", { name: "编辑" }).click();
  await page.getByPlaceholder("分享课程内容、功课量或考试体验…").fill(edited);
  await page.getByRole("button", { name: "保存修改" }).click();
  const editedReview = page.getByRole("listitem").filter({ hasText: edited });
  await expect(editedReview.getByText("已编辑")).toBeVisible();
  await expect(
    editedReview.getByRole("button", { name: "回复 1" }),
  ).toBeVisible();
  await expect.poll(() => replyCountForReview(edited)).toBe(1);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("delete-own-course-review").click();
  await expect(editedReview).toHaveCount(0);
  await expect.poll(() => replyCountForReview(edited)).toBe(0);
});

test("#462 review UI stays intact while replies use a compact identity row", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const reviewContent = `identity-layout-${randomUUID()}`;
  const replyContent = `identity-reply-${randomUUID()}`;
  reviewContents.push(reviewContent);

  await createIdentityLayoutFixture(reviewContent, replyContent);
  await page.goto("/courses/CSCI1130");

  const review = page.getByRole("listitem").filter({ hasText: reviewContent });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "回复 1" }).click();
  const replies = review.getByRole("region", { name: "评论回复" });
  const reply = replies.getByRole("listitem").filter({ hasText: replyContent });
  await expect(reply).toBeVisible();

  const replyAuthor = reply.locator('[data-slot="reply-author"]');
  const replyContentRegion = reply.locator('[data-slot="reply-content"]');
  const [desktopReplyAuthor, desktopReplyContent] = await Promise.all([
    replyAuthor.boundingBox(),
    replyContentRegion.boundingBox(),
  ]);

  expect(desktopReplyAuthor).not.toBeNull();
  expect(desktopReplyContent).not.toBeNull();
  expect(desktopReplyContent!.x).toBe(desktopReplyAuthor!.x);
  await expect(review.locator('[data-slot="avatar"]')).toHaveCount(1);
  await expect(replies.locator('[data-slot="avatar"]')).toHaveCount(0);

  await page.setViewportSize({ width: 393, height: 851 });
  const [mobileReplyAuthor, mobileReplyContent] = await Promise.all([
    replyAuthor.boundingBox(),
    replyContentRegion.boundingBox(),
  ]);

  expect(mobileReplyContent!.x).toBe(mobileReplyAuthor!.x);
  for (const region of [review, reply]) {
    const widths = await region.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  }
});
