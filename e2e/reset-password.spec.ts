import { randomInt } from "node:crypto";
import {
  request as apiRequest,
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  createOtpOnlyUser,
  expireLatestOtp,
  otpExists,
  userExists,
} from "./helpers/otp";
import { LOCAL_E2E_OTP } from "@/lib/e2e-otp";

const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "new-password-2";

function freshEmail() {
  return `1155${randomInt(1_000_000).toString().padStart(6, "0")}@link.cuhk.edu.hk`;
}

async function createUser(request: APIRequestContext, email: string) {
  const registration = await request.post("/api/auth/sign-up/email", {
    data: {
      email,
      password: OLD_PASSWORD,
      name: "重置测试",
      nickname: "重置测试",
    },
  });
  expect(registration.ok()).toBe(true);
}

async function requestReset(page: Page, email: string) {
  await page.goto("/reset-password");
  await page.getByLabel(/邮箱/).fill(email);
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(
    page.getByText(`如果这个邮箱已注册，验证码将发送至 ${email}`),
  ).toBeVisible();
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

test("recovery gives the same response for an unknown email without issuing a code", async ({
  page,
}) => {
  const email = "missing-recovery-account@example.com";
  await requestReset(page, email);
  expect(await otpExists(email, "forget-password")).toBe(false);
  expect(await userExists(email)).toBe(false);
});

test("an existing account with a named CUHK Link address can recover its password", async ({
  page,
  baseURL,
}) => {
  const email = `legacy-recovery-${randomInt(1_000_000)}@link.cuhk.edu.hk`;
  await createOtpOnlyUser(email, "历史账号");

  await requestReset(page, email);
  expect(await otpExists(email, "forget-password")).toBe(true);
  await submitReset(page, LOCAL_E2E_OTP);

  await expect(page.getByText("密码已重置，请使用新密码登录。")).toBeVisible();
  expect(await passwordWorks(baseURL!, email, NEW_PASSWORD)).toBe(true);
});

test("wrong OTP does not change the password", async ({
  page,
  request,
  baseURL,
}) => {
  const email = freshEmail();
  await createUser(request, email);
  await requestReset(page, email);
  const wrongOtp = "000000";

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
  const otp = LOCAL_E2E_OTP;
  await expireLatestOtp(email, "forget-password");

  await submitReset(page, otp);

  await expect(page.getByText(/验证码.*(?:无效|过期)/)).toBeVisible();
  expect(await passwordWorks(baseURL!, email, OLD_PASSWORD)).toBe(true);
  expect(await passwordWorks(baseURL!, email, NEW_PASSWORD)).toBe(false);
});

test("mailbox owner can recover an unverified signup and revoke its existing access", async ({
  page,
  request,
  baseURL,
}) => {
  const email = freshEmail();
  await createUser(request, email);
  const previousSession = await request.get("/api/auth/get-session");
  expect((await previousSession.json()).user).toMatchObject({
    email,
    emailVerified: false,
  });

  const otpLogin = await page.request.post(
    "/api/auth/email-otp/send-verification-otp",
    {
      data: { email, type: "sign-in" },
      headers: { origin: baseURL! },
    },
  );
  expect(otpLogin.ok()).toBe(false);
  expect(await otpLogin.json()).toMatchObject({
    message: "请使用密码登录，忘记密码可通过邮件重置",
  });

  await requestReset(page, email);
  await submitReset(page, LOCAL_E2E_OTP);

  await expect(page.getByText("密码已重置，请使用新密码登录。")).toBeVisible();
  expect(await passwordWorks(baseURL!, email, OLD_PASSWORD)).toBe(false);
  const revokedSession = await request.get("/api/auth/get-session");
  expect(await revokedSession.json()).toBeNull();

  await page.getByRole("button", { name: "前往登录" }).click();
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL("/");
});
