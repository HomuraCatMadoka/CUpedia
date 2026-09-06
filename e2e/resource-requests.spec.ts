import { expect, test } from "@playwright/test";
import { DEFAULT_AVATAR_URL } from "@/lib/user-avatar";

test("home keeps its cold-load script request budget", async ({ page }) => {
  const scripts = new Set<string>();
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.add(request.url());
  });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  // Observe late script loads after readiness; timeout means no budget breach.
  await expect(
    page.waitForRequest(
      (request) => request.resourceType() === "script" && scripts.size > 16,
      { timeout: 1500 },
    ),
  ).rejects.toThrow(/Timeout/);
  expect(scripts.size).toBeLessThanOrEqual(16);
});

test("only the versioned default avatar has immutable caching", async ({
  request,
}) => {
  const avatar = await request.get(DEFAULT_AVATAR_URL);
  expect(avatar.ok()).toBe(true);
  expect(avatar.headers()["cache-control"]).toContain("max-age=31536000");
  expect(avatar.headers()["cache-control"]).toContain("immutable");
  const unversioned = await request.get("/images/default-avatar.jpg");
  expect(unversioned.headers()["cache-control"]).not.toContain("immutable");
});

test("canteen preserves its anonymous identity across reloads", async ({
  page,
  context,
}) => {
  const initialResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      Boolean(response.request().headers()["next-action"]),
  );
  await page.goto("/canteen");
  await initialResponse;
  const original = (await context.cookies()).find(
    (cookie) => cookie.name === "canteen_anon_session",
  );
  expect(original?.httpOnly).toBe(true);
  const reinitialized = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      Boolean(response.request().headers()["next-action"]),
  );
  await page.reload();
  expect((await reinitialized).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "山城食记" })).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === original?.name)
      ?.value,
  ).toBe(original?.value);
});

for (const value of ["tampered", "expired-session.1.invalid-signature"]) {
  test(`canteen replaces an invalid anonymous cookie: ${value}`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "canteen_anon_session",
        value,
        url: baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const initialized = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        Boolean(response.request().headers()["next-action"]),
    );
    await page.goto("/canteen");
    expect((await initialized).ok()).toBe(true);
    const cookie = (await context.cookies()).find(
      (item) => item.name === "canteen_anon_session",
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).not.toBe(value);
  });
}
