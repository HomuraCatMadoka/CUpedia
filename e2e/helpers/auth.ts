import type { Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password123";

export async function loginAsAdmin(page: Page, baseURL = "") {
  const response = await page.request.post(
    `${baseURL}/api/auth/sign-in/email`,
    { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } },
  );

  if (!response.ok()) {
    throw new Error(
      `admin login failed (${response.status()}): ${await response.text()}`,
    );
  }
}
