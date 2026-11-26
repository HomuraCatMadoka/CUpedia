import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./helpers/auth";

const COURSE_CODE = "CSCI9944";
const COURSE_PATH = `/courses/${COURSE_CODE}`;
const PROFESSOR_ID = "e2e-course-pagination-instructor";
const PROFESSOR_NAME = "Professor Pagination Wong";
const AUTHOR = "contributor@test.com";
const VOTER = "user@test.com";
const ENROLLMENT_INSTRUCTOR = "Enrollment Instructor 944";

const REVIEWS = Array.from({ length: 12 }, (_, index) => {
  // The cursor boundary has an exact tie, followed by a row one microsecond older.
  const minutesAgo = Math.min(index, 9);
  const timestamp = new Date(Date.UTC(2025, 10, 25, 12, -minutesAgo));
  return {
    id: `${index === 9 ? "b" : "a"}${randomUUID().slice(1)}`,
    content: `course-pagination-seed-review-${index + 1}-end`,
    createdAt: timestamp
      .toISOString()
      .replace(".000Z", index === 11 ? ".123455Z" : ".123456Z"),
  };
});
const FIRST_OLDER_REVIEW = REVIEWS[10];
const OLDEST_REVIEW = REVIEWS[11];
const REPLY_ID = randomUUID();
const REPLY_CONTENT = "course-pagination-seed-exact-reply";

let fixtureCreated = false;

async function withDatabase(callback: (client: Client) => Promise<void>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await callback(client);
  } finally {
    await client.end();
  }
}

test.describe("course detail review pagination, ref #944", () => {
  test.describe.configure({ mode: "default" });

  test.beforeAll(async () => {
    await withDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `insert into courses (code, subject, title, units)
           values ($1, 'CSCI', 'E2E Review Pagination', 3)`,
          [COURSE_CODE],
        );
        await client.query(
          `insert into staff_people (id, canonical_name, source)
           values ($1, $2, 'e2e')`,
          [PROFESSOR_ID, PROFESSOR_NAME],
        );
        await client.query(
          "insert into course_instructors (person_id) values ($1)",
          [PROFESSOR_ID],
        );
        await client.query(
          `insert into course_reviews
             (id, course_code, user_id, content, instructor_person_id,
              professor_name_snapshot, academic_year, term, created_at, updated_at)
           select fixture.id, $1, users.id, fixture.content,
                  case when fixture.position > 10 then $2 end,
                  case when fixture.position > 10 then $3 end,
                  '2025-26', 'Term 2', fixture.created_at, fixture.created_at
           from unnest($4::uuid[], $5::text[], $6::timestamp[]) with ordinality
             as fixture(id, content, created_at, position)
           cross join users
           where users.email = $7`,
          [
            COURSE_CODE,
            PROFESSOR_ID,
            PROFESSOR_NAME,
            REVIEWS.map(({ id }) => id),
            REVIEWS.map(({ content }) => content),
            REVIEWS.map(({ createdAt }) => createdAt),
            AUTHOR,
          ],
        );
        await client.query(
          `insert into course_review_replies (review_id, user_id, content, created_at)
           select $1, users.id, 'Earlier reply ' || n, now() - (25 - n) * interval '1 minute'
           from generate_series(1, 24) as n
           cross join users
           where users.email = $2`,
          [OLDEST_REVIEW.id, VOTER],
        );
        await client.query(
          `insert into course_review_replies (id, review_id, user_id, content)
           select $1, $2, users.id, $3 from users where email = $4`,
          [REPLY_ID, OLDEST_REVIEW.id, REPLY_CONTENT, VOTER],
        );
        await client.query(
          `insert into course_enrollments
             (academic_year, term, course_code, class_code, class_nbr,
              component, section, quota, vacancy, instructors, captured_at)
           values ('2025-26', 'Term 2', $1, $1, '9944',
                   'LEC', 'A', 60, 8, array[$2], now())`,
          [COURSE_CODE, ENROLLMENT_INSTRUCTOR],
        );
        await client.query("COMMIT");
        fixtureCreated = true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  });

  test.afterAll(async () => {
    if (!fixtureCreated) return;
    await withDatabase(async (client) => {
      await client.query("delete from course_reviews where course_code = $1", [
        COURSE_CODE,
      ]);
      await client.query(
        "delete from course_enrollments where course_code = $1",
        [COURSE_CODE],
      );
      await client.query("delete from courses where code = $1", [COURSE_CODE]);
      await client.query(
        "delete from course_instructors where person_id = $1",
        [PROFESSOR_ID],
      );
      await client.query("delete from staff_people where id = $1", [
        PROFESSOR_ID,
      ]);
    });
  });

  test("sends ten reviews initially and loads the remaining ones on demand", async ({
    page,
  }) => {
    const reviewsResponse = await page.goto(COURSE_PATH);
    expect(reviewsResponse?.ok()).toBe(true);
    const payload = await reviewsResponse?.text();
    expect(payload).not.toContain(OLDEST_REVIEW.content);
    expect(payload).not.toContain(ENROLLMENT_INSTRUCTOR);

    const reviews = page.locator("#course-review > ul > li");
    await expect(reviews).toHaveCount(10);
    await expect(reviews.first()).toContainText(REVIEWS[0].content);
    await expect(reviews.last()).toContainText(REVIEWS[9].content);

    const showMore = page.getByRole("button", { name: "再看 2 条测评" });
    await showMore.click();
    await expect(reviews).toHaveCount(12);
    await expect(reviews.nth(10)).toContainText(FIRST_OLDER_REVIEW.content);
    await expect(reviews.last()).toContainText(OLDEST_REVIEW.content);
    await expect(showMore).toHaveCount(0);
  });

  test("lists professors present only in later pages and filters across the course", async ({
    page,
  }) => {
    await page.goto(COURSE_PATH);
    const reviews = page.locator("#course-review > ul > li");
    await expect(reviews).toHaveCount(10);
    await expect(
      reviews.filter({ hasText: OLDEST_REVIEW.content }),
    ).toHaveCount(0);

    await page.getByLabel("按任课教授筛选").selectOption(PROFESSOR_ID);

    await expect(reviews).toHaveCount(2);
    await expect(reviews.first()).toContainText(FIRST_OLDER_REVIEW.content);
    await expect(reviews.last()).toContainText(OLDEST_REVIEW.content);
  });

  test("opens the exact reply to an older review from a direct link", async ({
    page,
  }) => {
    const query = new URLSearchParams({
      review: OLDEST_REVIEW.id,
      reply: REPLY_ID,
    });
    await page.goto(`${COURSE_PATH}?${query}`);

    const reviews = page.locator("#course-review > ul > li");
    const target = reviews.filter({ hasText: OLDEST_REVIEW.content });
    await expect(target).toBeVisible();
    const replies = target.getByRole("region", { name: "评论回复" });
    await expect(
      replies.getByText(REPLY_CONTENT, { exact: true }),
    ).toBeVisible();
    await expect(
      replies.getByText("Earlier reply 1", { exact: true }),
    ).toHaveCount(0);
    await expect(reviews.filter({ hasText: REVIEWS[0].content })).toBeVisible();
    await expect(
      reviews.filter({ hasText: FIRST_OLDER_REVIEW.content }),
    ).toHaveCount(0);
    await expect(page.getByText("消息不存在", { exact: true })).toHaveCount(0);
  });

  test("keeps a later review's like state specific to the current viewer", async ({
    page,
    browser,
  }) => {
    await loginWithPassword(page, VOTER, "password123");
    await page.goto(COURSE_PATH);
    await page.getByRole("button", { name: "再看 2 条测评" }).click();
    const likedReview = page
      .getByRole("listitem")
      .filter({ hasText: FIRST_OLDER_REVIEW.content });
    const like = likedReview.getByRole("button", { name: "点赞", exact: true });
    await expect(like).toHaveAttribute("aria-pressed", "false");
    const saveLike = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === COURSE_PATH,
    );
    await like.click();
    expect((await saveLike).ok()).toBe(true);
    await expect(like).toHaveAttribute("aria-busy", "false");
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#course-review > ul")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.locator("#course-review > ul > li")).toHaveCount(12);

    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(COURSE_PATH);
      await guestPage.getByRole("button", { name: "再看 2 条测评" }).click();
      const guestReview = guestPage
        .getByRole("listitem")
        .filter({ hasText: FIRST_OLDER_REVIEW.content });
      const guestLike = guestReview.getByRole("button", {
        name: "登录后可点赞",
      });
      await expect(guestLike).toHaveAttribute("aria-pressed", "false");
      await expect(guestLike).toHaveText("1");
      await expect(guestLike).toBeDisabled();
    } finally {
      await guest.close();
    }
  });

  test("keeps the expanded list and open thread after a reply refreshes the route", async ({
    page,
  }) => {
    await loginWithPassword(page, AUTHOR, "password123");
    await page.goto(COURSE_PATH);
    await page.getByRole("button", { name: "再看 2 条测评" }).click();
    const reviews = page.locator("#course-review > ul > li");
    await expect(reviews).toHaveCount(12);

    const laterReview = reviews.filter({ hasText: FIRST_OLDER_REVIEW.content });
    await laterReview.getByRole("button", { name: "回复 0" }).click();
    const thread = laterReview.getByRole("region", { name: "评论回复" });
    const reply = "course-pagination-new-reply-on-page-two";
    await thread.getByRole("textbox", { name: "回复内容" }).fill(reply);
    await thread.getByRole("button", { name: "发布回复" }).click();

    await expect(thread.getByText(reply, { exact: true })).toBeVisible();
    await expect(
      laterReview.getByRole("button", { name: "回复 1" }),
    ).toBeVisible();
    await expect(reviews).toHaveCount(12);
  });

  test("renders enrollment history without sending review content", async ({
    page,
  }) => {
    const enrollmentResponse = await page.goto(`${COURSE_PATH}?tab=enrollment`);
    expect(enrollmentResponse?.ok()).toBe(true);
    expect(await enrollmentResponse?.text()).not.toContain(REVIEWS[0].content);
    await expect(
      page.getByRole("link", { name: "选课人数参考", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByText(ENROLLMENT_INSTRUCTOR, { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#peer-reviews")).toHaveCount(0);
  });
});
