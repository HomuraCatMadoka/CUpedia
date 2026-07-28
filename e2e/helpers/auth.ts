import type { Page } from "@playwright/test";

let adminCookies:
  | Parameters<ReturnType<Page["context"]>["addCookies"]>[0]
  | undefined;

export async function loginAsAdmin(page: Page, baseURL = "") {
  if (adminCookies) {
    await page.context().addCookies(adminCookies);
    return;
  }

  await loginWithPassword(page, "admin@test.com", "password123", baseURL);
  adminCookies = await page.context().cookies();
}

export async function loginWithPassword(
  page: Page,
  email: string,
  password: string,
  baseURL = "",
) {
  const response = await page.request.post(
    `${baseURL}/api/auth/sign-in/email`,
    { data: { email, password } },
  );

  if (!response.ok()) {
    throw new Error(
      `password login failed (${response.status()}): ${await response.text()}`,
    );
  }
}
