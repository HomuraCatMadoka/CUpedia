import type { Page } from "@playwright/test";

export async function loginAsAdmin(page: Page, baseURL = "") {
  return loginWithPassword(page, "admin@test.com", "password123", baseURL);
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
