import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

import { loginWithPassword } from "./helpers/auth";

const notificationIds: string[] = [];
const reviewIds: string[] = [];

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function userId(email: string): Promise<string> {
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(
      "select id from users where email = $1",
      [email],
    );
    return result.rows[0].id;
  });
}

async function seedNotifications(count: number) {
  const recipientId = await userId("user@test.com");
  const actorId = await userId("contributor@test.com");
  await withClient(async (client) => {
    for (let index = 0; index < count; index += 1) {
      const id = randomUUID();
      notificationIds.push(id);
      await client.query(
        `insert into notifications
          (id, recipient_id, actor_id, kind, metadata, created_at)
         values ($1, $2, $3, 'course_review_reply', $4::jsonb, now() - ($5 * interval '1 minute'))`,
        [
          id,
          recipientId,
          actorId,
          JSON.stringify({
            courseCode: "CSCI3150",
            reviewId: randomUUID(),
            replyId: randomUUID(),
          }),
          index,
        ],
      );
    }
  });
}

async function seedAnonymousReviews(contents: string[]): Promise<string[]> {
  const authorId = await userId("user@test.com");
  return withClient(async (client) => {
    const ids: string[] = [];
    for (const [index, content] of contents.entries()) {
      const id = randomUUID();
      ids.push(id);
      reviewIds.push(id);
      await client.query(
        `insert into course_reviews
          (id, course_code, user_id, content, academic_year, term, score, is_anonymous)
         values ($1, 'CSCI1130', $2, $3, '2025-26', $4, 4.5, true)`,
        [id, authorId, content, index === 0 ? "Term 1" : "Term 2"],
      );
    }
    return ids;
  });
}

async function unreadNotificationReviewId(): Promise<string> {
  return withClient(async (client) => {
    const recipientId = await userId("user@test.com");
    const result = await client.query<{ review_id: string }>(
      `select metadata->>'reviewId' as review_id
       from notifications
       where recipient_id = $1 and read_at is null
       order by created_at desc
       limit 1`,
      [recipientId],
    );
    return result.rows[0].review_id;
  });
}

async function cleanup() {
  await withClient(async (client) => {
    if (notificationIds.length) {
      await client.query("delete from notifications where id = any($1)", [
        notificationIds,
      ]);
    }
    if (reviewIds.length) {
      await client.query("delete from course_reviews where id = any($1)", [
        reviewIds,
      ]);
    }
  });
  notificationIds.length = 0;
  reviewIds.length = 0;
}

async function openNotificationCenter(page: Page) {
  await page.getByRole("button", { name: /^通知(?:，\d+ 条未读)?$/ }).click();
  return page.locator('[data-slot="popover-content"]');
}

function waitForWikiServerAction(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/wiki";
  });
}

test.describe.serial("#446 global notification center", () => {
  test.afterEach(cleanup);

  test("keeps a compact mobile popover, paginates 10 at a time, and marks all history read", async ({
    page,
  }) => {
    await seedNotifications(11);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginWithPassword(page, "user@test.com", "password123");
    await page.goto("/");

    await expect(page.getByTestId("notification-badge")).toHaveText("9+");
    let popover = await openNotificationCenter(page);
    await expect(popover).toBeVisible();
    await expect(
      popover.getByRole("button", { name: /Contributor/ }),
    ).toHaveCount(10);
    const box = await popover.boundingBox();
    expect(box?.width).toBeLessThan(390);
    expect(box?.height).toBeLessThan(844 * 0.75);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);

    await page.getByRole("button", { name: /^通知(?:，\d+ 条未读)?$/ }).click();
    await expect(popover).toBeHidden();
    popover = await openNotificationCenter(page);
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    popover = await openNotificationCenter(page);
    await page.getByRole("link", { name: "CUpedia" }).click();
    await expect(popover).toBeHidden();

    popover = await openNotificationCenter(page);
    await popover.getByRole("button", { name: "加载更多" }).click();
    await expect(
      popover.getByRole("button", { name: /Contributor/ }),
    ).toHaveCount(11);
    await popover.getByRole("button", { name: "全部标为已读" }).click();
    await expect(page.getByTestId("notification-badge")).toHaveCount(0);
    await expect(popover.getByText("全部通知已标为已读")).toHaveCount(0);

    await expect
      .poll(() =>
        withClient(async (client) => {
          const result = await client.query<{ count: number }>(
            "select count(*)::int as count from notifications where id = any($1) and read_at is null",
            [notificationIds],
          );
          return result.rows[0].count;
        }),
      )
      .toBe(0);
  });

  test("notifies an anonymous review author, deep-links to the reply, and survives source deletion", async ({
    page,
    browser,
  }) => {
    const contents = [
      `notification-parent-a-${randomUUID()}`,
      `notification-parent-b-${randomUUID()}`,
    ];
    const replies = [
      `notification-reply-a-${randomUUID()}`,
      `notification-reply-b-${randomUUID()}`,
    ];
    const seededReviewIds = await seedAnonymousReviews(contents);

    const contributorContext = await browser.newContext();
    const contributor = await contributorContext.newPage();
    await loginWithPassword(contributor, "contributor@test.com", "password123");
    await contributor.goto("/courses/CSCI1130");
    for (const [index, content] of contents.entries()) {
      const review = contributor
        .getByRole("listitem")
        .filter({ hasText: content });
      await review.getByRole("button", { name: "回复 0" }).click();
      const region = review.getByRole("region", { name: "评论回复" });
      await region
        .getByRole("textbox", { name: "回复内容" })
        .fill(replies[index]);
      await region.getByRole("button", { name: "发布回复" }).click();
      await expect(region.getByText(replies[index])).toBeVisible();
      await expect
        .poll(() =>
          withClient(async (client) => {
            const result = await client.query<{ count: number }>(
              "select count(*)::int as count from course_review_replies where review_id = $1",
              [seededReviewIds[index]],
            );
            return result.rows[0].count;
          }),
        )
        .toBe(1);
    }
    await contributorContext.close();

    const { generated, facts } = await withClient(async (client) => {
      const notificationsResult = await client.query<{
        id: string;
        metadata: Record<string, unknown>;
      }>(
        `select id, metadata
         from notifications
         where metadata->>'reviewId' = any($1)
         order by created_at desc`,
        [seededReviewIds],
      );
      const factsResult = await client.query<{
        review_user_id: string;
        reply_user_id: string;
      }>(
        `select review.user_id as review_user_id, reply.user_id as reply_user_id
         from course_reviews review
         join course_review_replies reply on reply.review_id = review.id
         where review.id = any($1::uuid[])`,
        [seededReviewIds],
      );
      return {
        generated: notificationsResult.rows,
        facts: factsResult.rows,
      };
    });
    expect(facts).toHaveLength(2);
    expect(
      facts.every((fact) => fact.review_user_id !== fact.reply_user_id),
    ).toBe(true);
    notificationIds.push(...generated.map((row) => row.id));
    expect(generated).toHaveLength(2);
    expect(generated.every((row) => !("content" in row.metadata))).toBe(true);

    await loginWithPassword(page, "user@test.com", "password123");
    await page.goto("/courses/CSCI1130");
    await expect(page.getByTestId("notification-badge")).toHaveText("2");
    let popover = await openNotificationCenter(page);
    await expect(popover.getByText("Contributor").first()).toBeVisible();
    for (const reply of replies) {
      await expect(popover.getByText(reply)).toHaveCount(0);
    }

    await popover
      .getByRole("button", { name: /Contributor/ })
      .first()
      .click();
    await expect(page).toHaveURL(/review=.*&reply=.*/);
    await expect(page.getByRole("region", { name: "评论回复" })).toBeVisible();
    await expect(
      page.getByText(new RegExp("notification-reply-")),
    ).toBeVisible();

    await page.goto("/courses/CSCI1130");
    const missingReviewId = await unreadNotificationReviewId();
    await withClient(async (client) => {
      await client.query("delete from course_reviews where id = $1", [
        missingReviewId,
      ]);
    });
    popover = await openNotificationCenter(page);
    const unread = popover.getByLabel("未读").first();
    await unread.locator("xpath=ancestor::button").click();
    await expect(page.getByText("消息不存在", { exact: true })).toBeVisible();

    await expect
      .poll(() =>
        withClient(async (client) => {
          const result = await client.query<{ count: number }>(
            "select count(*)::int as count from notifications where id = any($1)",
            [notificationIds],
          );
          return result.rows[0].count;
        }),
      )
      .toBe(2);
  });

  test("keeps every notification state intact in the mobile Wiki Header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await loginWithPassword(page, "user@test.com", "password123");
    const initialCount = waitForWikiServerAction(page);
    await page.goto("/wiki");
    await initialCount;
    await expect(page.getByTestId("notification-badge")).toHaveCount(0);

    await seedNotifications(3);
    await page.reload();
    await expect(page.getByTestId("notification-badge")).toHaveText("3");

    await seedNotifications(8);
    await page.reload();
    await expect(page.getByTestId("notification-badge")).toHaveText("9+");

    await cleanup();
    const clearedCount = waitForWikiServerAction(page);
    await page.reload();
    await clearedCount;
    await expect(page.getByTestId("notification-badge")).toHaveCount(0);

    let releaseRequests: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    await page.route("**/wiki", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await requestGate;
      await route.abort("failed");
    });

    const popover = await openNotificationCenter(page);
    await expect(popover.getByText("正在加载通知…")).toBeVisible();
    releaseRequests?.();
    await expect(popover.getByText("通知加载失败")).toBeVisible();
  });
});
