import { randomInt } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import {
  expireLatestOtp,
  insertOtp,
  readLatestOtp,
  userExists,
} from "./helpers/otp";
import { LOCAL_E2E_OTP } from "@/lib/e2e-otp";

function freshEmail() {
  return `1155${randomInt(1_000_000).toString().padStart(6, "0")}@link.cuhk.edu.hk`;
}

async function startRegistration(
  page: Page,
  email: string,
  password = "register-flow-pw",
) {
  await page.goto("/register");
  await page.getByLabel("CUHK 邮箱").fill(email);
  await page.getByLabel("昵称").fill("注册测试");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByText(`验证码已发送至 ${email}`)).toBeVisible();
}

test("registration form rejects a non-CUHK email before account creation", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("CUHK 邮箱").fill("student@gmail.com");
  await page.getByLabel("昵称").fill("注册测试");
  await page.getByLabel("密码", { exact: true }).fill("register-flow-pw");
  await page.getByLabel("确认密码").fill("register-flow-pw");
  await page.getByRole("button", { name: "注册", exact: true }).click();

  await expect(page.getByText("仅支持 CUHK 邮箱注册")).toBeVisible();
  expect(await userExists("student@gmail.com")).toBe(false);
});

test("signup API rejects invalid nicknames without creating accounts", async ({
  request,
}) => {
  for (const nickname of ["", "x", "a".repeat(21), "bad-name", "ab\ncd"]) {
    const email = freshEmail();
    const response = await request.post("/api/auth/sign-up/email", {
      data: {
        email,
        password: "register-flow-pw",
        name: "API caller",
        nickname,
      },
    });

    expect(response.status()).toBe(400);
    expect(await userExists(email)).toBe(false);
  }
});

test("wrong registration OTP leaves the complete account unverified and retryable", async ({
  page,
}) => {
  const email = freshEmail();
  await startRegistration(page, email);
  const actualOtp = LOCAL_E2E_OTP;
  const wrongOtp = "000000";

  await page.getByLabel("验证码").fill(wrongOtp);
  await page.getByRole("button", { name: "验证并登录" }).click();

  await expect(page.getByText(/验证码.*(?:无效|过期)/)).toBeVisible();
  expect(await userExists(email)).toBe(true);
  expect(
    await (await page.request.get("/api/auth/get-session")).json(),
  ).toBeNull();

  await page.getByLabel("验证码").fill(actualOtp);
  await page.getByRole("button", { name: "验证并登录" }).click();
  await expect(page).toHaveURL("/");
});

test("expired registration OTP can be resent without recreating the account", async ({
  page,
}) => {
  const email = freshEmail();
  await startRegistration(page, email);
  const otp = LOCAL_E2E_OTP;
  await expireLatestOtp(email, "email-verification");

  await page.getByLabel("验证码").fill(otp);
  await page.getByRole("button", { name: "验证并登录" }).click();
  await expect(page.getByText(/验证码.*(?:无效|过期)/)).toBeVisible();

  await page.getByRole("button", { name: "重新发送" }).click();
  const resentOtp = LOCAL_E2E_OTP;
  await page.getByLabel("验证码").fill(resentOtp);
  await page.getByRole("button", { name: "验证并登录" }).click();
  await expect(page).toHaveURL("/");
});

test("an interrupted registration can resume after a full page reload", async ({
  page,
}) => {
  const email = freshEmail();
  const password = "register-flow-pw";
  await startRegistration(page, email, password);

  await page.reload();
  await page.getByLabel("CUHK 邮箱").fill(email);
  await page.getByLabel("昵称").fill("注册测试");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByLabel("验证码")).toBeVisible();

  await page.getByRole("button", { name: "重新发送" }).click();
  await page.getByLabel("验证码").fill(LOCAL_E2E_OTP);
  await page.getByRole("button", { name: "验证并登录" }).click();

  await expect(page).toHaveURL("/");
  expect(await userExists(email)).toBe(true);
});

test("new CUHK user verifies email, enters the app, and can password-login independently", async ({
  page,
  browser,
}) => {
  const email = freshEmail();
  const password = "register-flow-pw";
  await startRegistration(page, email, password);
  expect(await readLatestOtp(email, "email-verification")).toBe(LOCAL_E2E_OTP);
  await page.getByLabel("验证码").fill(LOCAL_E2E_OTP);
  await page.getByRole("button", { name: "验证并登录" }).click();

  await expect(page).toHaveURL("/");
  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json()).user).toMatchObject({
    email,
    nickname: "注册测试",
  });

  const context = await browser.newContext();
  const loginPage = await context.newPage();
  await loginPage.goto("/login");
  await loginPage.getByLabel("邮箱").fill(email);
  await loginPage.getByLabel("密码").fill(password);
  await loginPage.getByRole("button", { name: "登录", exact: true }).click();
  await expect(loginPage).toHaveURL("/");
  await context.close();
});

test("OTP login cannot implicitly create an unknown user", async ({
  request,
}) => {
  const email = freshEmail();
  await insertOtp(email, "sign-in", "123456");

  const response = await request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp: "123456" },
  });

  expect(response.ok()).toBe(false);
  expect(await userExists(email)).toBe(false);
});
