import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";

const VOTING_END_DATE_KEY = "canteen_shame_vote_end_date";

async function setTestVotingWindow(open: boolean) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (!open) {
      await client.query("delete from site_settings where key = $1", [
        VOTING_END_DATE_KEY,
      ]);
      return;
    }
    await client.query(
      `insert into site_settings (key, value)
       values (
         $1,
         to_char(
           (current_timestamp at time zone 'Asia/Hong_Kong') + interval '1 day',
           'YYYY-MM-DD'
         )
       )
       on conflict (key) do update set value = excluded.value`,
      [VOTING_END_DATE_KEY],
    );
  } finally {
    await client.end();
  }
}

test.beforeAll(() => setTestVotingWindow(true));
test.afterAll(() => setTestVotingWindow(false));

test("ref #485: logged-in voter can rapidly exceed the shame-rank rate limit", async ({
  page,
}) => {
  await loginWithPassword(page, "user@test.com", "password123");
  await page.goto("/canteen/shit-rank");

  // Default expanded — vote button is immediately visible
  const voteButton = page.getByRole("button", {
    name: "投 💩 给 演示食堂",
  });
  const count = voteButton.getByTestId("shame-vote-count");
  const initialCount = Number(await count.textContent());
  const actionStatuses: number[] = [];
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/canteen/shit-rank"
    ) {
      actionStatuses.push(response.status());
    }
  });

  for (let i = 0; i < 5; i += 1) {
    await voteButton.evaluate((button: HTMLButtonElement) => button.click());
  }
  await expect.poll(() => actionStatuses.length).toBeGreaterThanOrEqual(5);
  expect(actionStatuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
  await expect(count).toHaveText(String(initialCount + 5));

  await page.reload();
  await expect(
    page
      .getByRole("button", { name: "投 💩 给 演示食堂" })
      .getByTestId("shame-vote-count"),
  ).toHaveText(String(initialCount + 5));
});
