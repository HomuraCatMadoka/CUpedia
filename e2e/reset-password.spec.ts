import { randomInt } from "node:crypto";
import {
  request as apiRequest,
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { expireLatestOtp, readLatestOtp } from "./helpers/otp";

const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "new-password-2";

function freshEmail() {
  return `1155${randomInt(1_000_000).toString().padStart(6, "0")}@link.cuhk.edu.hk`;
}

async function createUser(request: APIRequestContext, email: string) {
  const otpRequest = await request.post(
    "/api/auth/email-otp/send-verification-otp",
    { data: { email, type: "sign-in" } },
  );
  expect(otpRequest.ok()).toBe(true);
  const registration = await request.post("/api/auth/register", {
    data: {
      email,
      otp: await readLatestOtp(email, "sign-in"),
      password: OLD_PASSWORD,
      nickname: "重置测试",
    },
  });
  expect(registration.ok()).toBe(true);
}

async function requestReset(page: Page, email: string) {
  await page.goto("/reset-password");
  await page.getByLabel("CUHK 邮箱").fill(email);
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByText(`验证码已发送至 ${email}`)).toBeVisible();
}

async function submitReset(page: Page, otp: string) {
  await page.getByLabel("验证码").fill(otp);
  await page.getByLabel("新密码", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("确认新密码").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "重置密码" }).click();
}

async function passwordWorks(baseURL: string, email: string, password: string) {
  const context = await apiRequest.newContext({ baseURL });
  try {
    const response = await context.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    return response.ok();
  } finally {
    await context.dispose();
  }
}

test("reset form rejects a non-CUHK email", async ({ page }) => {
  await page.goto("/reset-password");
  await page.getByLabel("CUHK 邮箱").fill("student@gmail.com");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByText("仅支持 CUHK 邮箱")).toBeVisible();
  await expect(page.getByLabel("验证码")).toHaveCount(0);
});

test("wrong OTP does not change the password", async ({
  page,
  request,
  baseURL,
}) => {
  const email = freshEmail();
  await createUser(request, email);
  await requestReset(page, email);
  const actualOtp = await readLatestOtp(email, "forget-password");
  const wrongOtp = actualOtp === "000000" ? "999999" : "000000";

  await submitReset(page, wrongOtp);

  await expect(page.getByText(/验证码.*(?:无效|过期)/)).toBeVisible();
  expect(await passwordWorks(baseURL!, email, OLD_PASSWORD)).toBe(true);
  expect(await passwordWorks(baseURL!, email, NEW_PASSWORD)).toBe(false);
});

test("expired OTP does not change the password", async ({
  page,
  request,
  baseURL,
}) => {
  const email = freshEmail();
  await createUser(request, email);
  await requestReset(page, email);
  const otp = await readLatestOtp(email, "forget-password");
  await expireLatestOtp(email, "forget-password");

  await submitReset(page, otp);

  await expect(page.getByText(/验证码.*(?:无效|过期)/)).toBeVisible();
  expect(await passwordWorks(baseURL!, email, OLD_PASSWORD)).toBe(true);
  expect(await passwordWorks(baseURL!, email, NEW_PASSWORD)).toBe(false);
});

test("user resets through the page and signs in with the new password", async ({
  page,
  request,
  baseURL,
}) => {
  const email = freshEmail();
  await createUser(request, email);
  await requestReset(page, email);
  await submitReset(page, await readLatestOtp(email, "forget-password"));

  await expect(page.getByText("密码已重置，请使用新密码登录。")).toBeVisible();
  expect(await passwordWorks(baseURL!, email, OLD_PASSWORD)).toBe(false);

  await page.getByRole("button", { name: "前往登录" }).click();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/wiki$/);
});
