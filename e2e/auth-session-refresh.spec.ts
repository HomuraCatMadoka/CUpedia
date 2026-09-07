import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { loginWithPassword } from "./helpers/auth";

const SEED_EMAIL = "user@test.com";
const SEED_PASSWORD = "password123";

function trackSessionRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/auth/get-session"
    ) {
      requests.push(request.url());
    }
  });
  return requests;
}

async function announceVisibleReturn(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.visibilityState))
    .toBe("visible");
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function revokeServerSessions(page: Page) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      "delete from sessions where user_id = (select id from users where email = $1)",
      [SEED_EMAIL],
    );
    expect(result.rowCount).toBeGreaterThan(0);
  } finally {
    await client.end();
  }

  const cachedSession = (await page.context().cookies()).find((cookie) =>
    cookie.name.endsWith("session_data"),
  );
  expect(cachedSession).toBeTruthy();
  await page.context().clearCookies({ name: cachedSession!.name });
}

async function expectSignedIn(page: Page) {
  await expect(
    page.getByTestId("account-slot").getByRole("button"),
  ).toBeVisible();
}

async function expectSignedOut(page: Page) {
  await expect(
    page
      .getByRole("link", { name: "登录", exact: true })
      .or(page.getByRole("button", { name: "登录", exact: true }))
      .first(),
  ).toBeVisible();
}

test.describe("#893 session refresh request ownership", () => {
  test("an anonymous load and visible-tab event each query the session once", async ({
    page,
  }) => {
    const sessionRequests = trackSessionRequests(page);
    await page.goto("/");
    await expectSignedOut(page);
    await expect.poll(() => sessionRequests.length).toBe(1);

    await announceVisibleReturn(page);
    await expect.poll(() => sessionRequests.length).toBe(2);

    for (let index = 0; index < 5; index++) await announceVisibleReturn(page);
    expect(sessionRequests).toHaveLength(2);
  });

  test("a visible tab coming back online refreshes a revoked session once", async ({
    page,
  }) => {
    await loginWithPassword(page, SEED_EMAIL, SEED_PASSWORD);
    const cachedSession = await page.request.get("/api/auth/get-session");
    expect(cachedSession.status()).toBe(200);
    expect(cachedSession.headers()["set-cookie"] ?? "").not.toContain(
      "session_data",
    );

    const sessionRequests = trackSessionRequests(page);
    await page.goto("/");
    await expectSignedIn(page);
    await expect.poll(() => sessionRequests.length).toBe(1);

    await page.context().setOffline(true);
    await revokeServerSessions(page);
    await announceVisibleReturn(page);
    expect(sessionRequests).toHaveLength(1);
    await page.context().setOffline(false);

    await expectSignedOut(page);
    expect(sessionRequests).toHaveLength(2);
  });

  test("another tab signing in and out refreshes the current tab once per action", async ({
    page,
  }) => {
    const sessionRequests = trackSessionRequests(page);
    await page.goto("/");
    await expectSignedOut(page);
    await expect.poll(() => sessionRequests.length).toBe(1);

    const otherTab = await page.context().newPage();
    await otherTab.goto("/login");
    await otherTab.getByLabel("CUHK 邮箱").fill(SEED_EMAIL);
    await otherTab.getByLabel("密码").fill(SEED_PASSWORD);
    await otherTab.getByRole("button", { name: "登录", exact: true }).click();
    await expect(otherTab).toHaveURL("/");
    await expectSignedIn(otherTab);
    await announceVisibleReturn(page);
    await expectSignedIn(page);
    await expect.poll(() => sessionRequests.length).toBe(2);

    await otherTab.getByTestId("account-slot").getByRole("button").click();
    await otherTab.getByRole("menuitem", { name: "登出" }).click();
    await expect(otherTab).toHaveURL("/login");
    await expectSignedOut(page);
    expect(sessionRequests).toHaveLength(3);
  });
});
