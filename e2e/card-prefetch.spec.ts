import { Client } from "pg";
import { expect, test } from "@playwright/test";
import { expectIdleWithoutPrefetch, trackPrefetch } from "./helpers/prefetch";

const content = "card-prefetch-review-fixture";
let createdProfileUserIds: string[] = [];

test.beforeAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const profiles = await client.query<{ user_id: string }>(
      `insert into achievement_profiles (user_id)
       select id from users where email = 'contributor@test.com'
       on conflict (user_id) do nothing returning user_id`,
    );
    createdProfileUserIds = profiles.rows.map((profile) => profile.user_id);
    await client.query(
      `insert into course_reviews (course_code, user_id, content, academic_year, term, score, is_anonymous)
       select 'CSCI1130', id, $1, '2025-26', 'Term 2', 4.5, false
       from users where email = 'user@test.com'`,
      [content],
    );
    await client.query(
      `insert into course_review_replies (review_id, user_id, content)
       select review.id, author.id, 'card-prefetch-reply-fixture'
       from course_reviews review cross join users author
       where review.content = $1 and author.email = 'contributor@test.com'`,
      [content],
    );
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from course_reviews where content = $1", [
      content,
    ]);
    await client.query(
      "delete from achievement_profiles where user_id = any($1::uuid[])",
      [createdProfileUserIds],
    );
  } finally {
    await client.end();
  }
});

for (const width of [1280, 390]) {
  test(`home cards avoid speculative requests at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const paths = trackPrefetch(page);
    await page.goto("/");
    const card = page.locator('main a[href="/canteen"]');
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await expectIdleWithoutPrefetch(page, paths);
    await card.click();
    await expect(page).toHaveURL(/\/canteen$/);
    await expect(page.getByRole("heading", { name: "山城食记" })).toBeVisible();
  });

  test(`canteen cards avoid speculative requests at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const paths = trackPrefetch(page);
    await page.goto("/canteen");
    const card = page.getByRole("link", { name: /演示食堂/ }).first();
    await expect(card).toBeVisible();
    await card.hover();
    await expectIdleWithoutPrefetch(page, paths);
    const href = await card.getAttribute("href");
    await card.click();
    await expect(page).toHaveURL(new RegExp(href!));
    await expect(
      page.locator('[data-canteen-menu-ready="true"]'),
    ).toBeVisible();
    await page.goBack();
    await expect(card).toBeVisible();
    paths.length = 0;
    await page.reload();
    await expect(card).toBeVisible();
    await expectIdleWithoutPrefetch(page, paths);
  });

  test(`review author cards avoid speculative requests at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const paths = trackPrefetch(page);
    await page.goto("/courses/CSCI1130");
    await expect(page.getByText(content, { exact: true })).toBeAttached();
    const author = page
      .locator('a[href^="/courses/achievements/showcase/"]')
      .first();
    await author.scrollIntoViewIfNeeded();
    const review = page.getByRole("listitem").filter({ hasText: content });
    await review.getByRole("button", { name: "回复 1" }).click();
    const replyAuthor = review
      .getByRole("region", { name: "评论回复" })
      .locator('a[href^="/courses/achievements/showcase/"]');
    await expect(replyAuthor).toBeVisible();
    await replyAuthor.hover();
    await author.hover();
    await expectIdleWithoutPrefetch(page, paths);
    const href = await author.getAttribute("href");
    await author.click();
    await expect(page).toHaveURL(new RegExp(href!));
    await expect(page.getByRole("heading", { name: "专业成就" })).toBeVisible();
    await page.goBack();
    await expect(page.getByText(content, { exact: true })).toBeAttached();
    paths.length = 0;
    await page.reload();
    await author.scrollIntoViewIfNeeded();
    await expectIdleWithoutPrefetch(page, paths);
  });
}
