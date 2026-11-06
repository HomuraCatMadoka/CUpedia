import { randomInt } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { insertOtp, otpExists, userExists } from "./helpers/otp";
import { loginWithPassword } from "./helpers/auth";

const PASSWORD = "register-flow-pw";
const NICKNAME = "注册测试";

function freshEmail() {
  return `1155${randomInt(1_000_000).toString().padStart(6, "0")}@link.cuhk.edu.hk`;
}

async function submitRegistration(
  page: Page,
  email: string,
  password = PASSWORD,
) {
  await page.goto("/register");
  await page.getByLabel("CUHK 邮箱").fill(email);
  await page.getByLabel("昵称").fill(NICKNAME);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
}

test("registration form rejects a non-CUHK email before account creation", async ({
  page,
}) => {
  const email = "student@gmail.com";
  await submitRegistration(page, email);

  await expect(page.getByText("仅支持 CUHK 邮箱注册")).toBeVisible();
  expect(await userExists(email)).toBe(false);
});

test("signup API validates the CUHK email and nickname before creating an account", async ({
  request,
}) => {
  const invalidProfiles = [
    { email: "direct-signup@gmail.com", nickname: NICKNAME },
    { email: "1154123456@link.cuhk.edu.hk", nickname: NICKNAME },
    ...["", "x", "a".repeat(21), "bad-name", "ab\ncd"].map((nickname) => ({
      email: freshEmail(),
      nickname,
    })),
  ];

  for (const { email, nickname } of invalidProfiles) {
    const response = await request.post("/api/auth/sign-up/email", {
      data: { email, password: PASSWORD, name: NICKNAME, nickname },
    });

    expect(response.status()).toBe(400);
    expect(await userExists(email)).toBe(false);
  }
});

test("new CUHK user can contribute immediately and sign back in by password", async ({
  page,
}) => {
  const email = freshEmail();
  await submitRegistration(page, email);

  await expect(page).toHaveURL("/");
  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json()).user).toMatchObject({
    email,
    nickname: NICKNAME,
    emailVerified: false,
  });
  expect(await otpExists(email, "email-verification")).toBe(false);

  await page.goto("/canteen");
  const message = `注册即用-${randomInt(1_000_000)}`;
  await page.getByLabel("弹幕内容").fill(message);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.locator(".danmaku-track-layer .danmaku-item", { hasText: message }),
  ).toBeVisible();

  await page.getByTestId("account-slot").getByRole("button").click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await expect(page).toHaveURL("/login");
  await page.getByLabel("CUHK 邮箱").fill(email);
  await page.getByLabel("密码").fill(PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL("/");
  const nextSession = await page.request.get("/api/auth/get-session");
  expect((await nextSession.json()).user).toMatchObject({
    email,
    nickname: NICKNAME,
  });
});

test("duplicate registration points to login and recovery without replacing the password", async ({
  page,
  request,
}) => {
  const email = freshEmail();
  const signup = await request.post("/api/auth/sign-up/email", {
    data: { email, password: PASSWORD, name: NICKNAME, nickname: NICKNAME },
  });
  expect(signup.ok()).toBe(true);

  await submitRegistration(page, email, "different-password");

  const form = page.locator("form");
  await expect(form.getByRole("alert")).toHaveText(
    "这个邮箱已有账号，请登录或找回密码",
  );
  await expect(form.getByRole("link", { name: "登录" })).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(form.getByRole("link", { name: "找回密码" })).toHaveAttribute(
    "href",
    "/reset-password",
  );
  expect(
    await (await page.request.get("/api/auth/get-session")).json(),
  ).toBeNull();

  await loginWithPassword(page, email, PASSWORD);
});

test("OTP login cannot implicitly create an unknown user", async ({
  request,
}) => {
  const email = freshEmail();
  const sendResponse = await request.post(
    "/api/auth/email-otp/send-verification-otp",
    { data: { email, type: "sign-in" } },
  );

  expect(sendResponse.ok()).toBe(false);
  expect(await sendResponse.json()).toMatchObject({
    message: "账号尚未注册，请先注册",
  });

  await insertOtp(email, "sign-in", "123456");

  const response = await request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp: "123456" },
  });

  expect(response.ok()).toBe(false);
  expect(await userExists(email)).toBe(false);
});
