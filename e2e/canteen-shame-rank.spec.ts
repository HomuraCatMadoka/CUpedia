import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/auth";

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
