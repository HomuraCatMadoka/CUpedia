import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";

// Course-review feature: subject filter (#267) + the logged-in rate/review/like
// lifecycle (#178). Runs against the isolated e2e db, which provision.ts wipes
// and re-seeds each run — the catalog there is the 26 SEED_COURSES fixture
// (CSCI×14, MATH×6, …), so assertions derive expected counts from the db
// rather than hard-coding them.

const CODE = "CSCI1130";
const review = `great-course-${randomUUID().slice(0, 8)}`;

async function query<T extends Record<string, unknown>>(text: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query<T>(text);
  } finally {
    await client.end();
  }
}

test("#267 subject filter shows the whole subject, uncapped", async ({
  page,
}) => {
  const { rows } = await query<{ count: string }>(
    "select count(*)::int as count from courses where subject = 'CSCI'",
  );
  const expected = Number(rows[0].count);
  expect(expected).toBeGreaterThan(0);

  await page.goto("/courses?subject=CSCI");

  await expect(
    page.getByText(`找到 ${expected} 门课程`, { exact: true }),
  ).toBeVisible();

  const cards = page.locator('a[href^="/courses/"]');
  await expect(cards).toHaveCount(expected);
  // Every card belongs to the selected subject.
  const hrefs = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")),
  );
  expect(hrefs.every((h) => h?.startsWith("/courses/CSCI"))).toBe(true);
});

test("#267 level filter narrows to a single course level", async ({ page }) => {
  // Level = leading digit of the code number; 1000-level = codes like CSCI1xxx.
  const { rows } = await query<{ count: string }>(
    "select count(*)::int as count from courses " +
      "where subject = 'CSCI' and substring(code from '[0-9]') = '1'",
  );
  const expected = Number(rows[0].count);
  expect(expected).toBeGreaterThan(0);

  await page.goto("/courses?subject=CSCI&level=1000");

  await expect(
    page.getByText(`找到 ${expected} 门课程`, { exact: true }),
  ).toBeVisible();

  const cards = page.locator('a[href^="/courses/"]');
  await expect(cards).toHaveCount(expected);
  const hrefs = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")),
  );
  // Every card is a CSCI 1000-level course.
  expect(hrefs.every((h) => h?.startsWith("/courses/CSCI1"))).toBe(true);
});

test("#178 logged-in rate + review + like lifecycle", async ({ page }) => {
  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto(`/courses/${CODE}`);

  // Rate: pick 9.0 (default is 8) and submit.
  await page.getByRole("button", { name: /9\.0/ }).click();
  await page.getByRole("button", { name: "提交评分" }).click();
  await expect(page.getByText(/你的评分：9\.0/)).toBeVisible();
  await expect(page.getByText(/综合 9\.0 分/)).toBeVisible();

  // Review: post an anonymous comment; the author sees a 撤回 affordance.
  await page.getByPlaceholder(/匿名分享/).fill(review);
  await page.getByRole("button", { name: "发表评论" }).click();
  await expect(page.getByText(review, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /撤回/ })).toBeVisible();

  // Like: toggle the like on the just-posted review, count 0 → 1.
  const likeBtn = page.locator('button[title="点赞"]');
  await expect(likeBtn).toContainText("0");
  await likeBtn.click();
  await expect(likeBtn).toContainText("1");

  // Persists across a reload.
  await page.reload();
  await expect(page.getByText(/综合 9\.0 分/)).toBeVisible();
  await expect(page.getByText(review, { exact: true })).toBeVisible();
  await expect(page.locator('button[title="点赞"]')).toContainText("1");

  // The redesigned list card reflects the new rating.
  await page.goto("/courses?subject=CSCI");
  await expect(page.locator(`a[href="/courses/${CODE}"]`)).toContainText("9.0");
});
