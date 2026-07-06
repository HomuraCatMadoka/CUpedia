import { test, expect } from "@playwright/test";

/**
 * Canteen dish voting against real Postgres (partial unique index + ON CONFLICT).
 *
 * Prerequisites before enabling:
 * 1. E2E seed includes a canteen + menu item fixture (current seed has no canteen rows).
 * 2. upsertVoteRow uses targetWhere matching partial unique indexes (see PR #209).
 */
test.fixme("anonymous diner can like a dish and see persisted state", async ({
  page,
}) => {
  await page.goto("/canteen");
  // TODO: navigate to seeded canteen menu, click 👍, reload, assert count + pressed state
  await expect(page.getByRole("button", { name: "点赞" }).first()).toBeVisible();
});

test.fixme("logged-in diner can change vote from like to dislike", async ({
  page,
}) => {
  // TODO: provision logged-in session, vote like then dislike, assert upsert overwrites
  expect(page).toBeTruthy();
});
