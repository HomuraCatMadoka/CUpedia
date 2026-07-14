import { randomInt } from "node:crypto";
import { test, expect } from "@playwright/test";
import { expireLatestOtp, readLatestOtp, userExists } from "./helpers/otp";

function freshEmail() {
  return `1155${randomInt(1_000_000).toString().padStart(6, "0")}@link.cuhk.edu.hk`;
}

async function requestOtp(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/register");
  await page.getByLabel("CUHK 邮箱").fill(email);
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByText(`验证码已发送至 ${email}`)).toBeVisible();
}

async function submitProfile(
  page: import("@playwright/test").Page,
  otp: string,
  password = "register-flow-pw",
) {
  await page.getByLabel("验证码").fill(otp);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("昵称").fill("注册测试");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
}

test("registration form rejects a non-CUHK email", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("CUHK 邮箱").fill("student@gmail.com");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByText("仅支持 CUHK 邮箱注册")).toBeVisible();
  await expect(page.getByLabel("验证码")).toHaveCount(0);
});

test("registration OTP check rejects a non-object request body", async ({
  request,
}) => {
  const response = await request.post("/api/auth/register/check-otp", {
    headers: { "Content-Type": "application/json" },
    data: "null",
  });

  expect(response.status()).toBe(400);
});

test("wrong OTP is understandable and does not create a user", async ({
  page,
}) => {
  const email = freshEmail();
  await requestOtp(page, email);
  const actualOtp = await readLatestOtp(email, "sign-in");
  const wrongOtp = actualOtp === "000000" ? "999999" : "000000";

  await page.getByLabel("验证码").fill(wrongOtp);
  await page.getByRole("button", { name: "下一步" }).click();

  await expect(page.getByText("验证码无效或已过期")).toBeVisible();
  await expect(page.getByLabel("昵称")).toHaveCount(0);
  expect(await userExists(email)).toBe(false);
});

test("expired OTP is understandable and does not create a user", async ({
  page,
}) => {
  const email = freshEmail();
  await requestOtp(page, email);
  const otp = await readLatestOtp(email, "sign-in");
  await expireLatestOtp(email, "sign-in");

  await page.getByLabel("验证码").fill(otp);
  await page.getByRole("button", { name: "下一步" }).click();

  await expect(page.getByText("验证码无效或已过期")).toBeVisible();
  await expect(page.getByLabel("昵称")).toHaveCount(0);
  expect(await userExists(email)).toBe(false);
});

test("concurrent wrong OTP checks cannot bypass the attempt limit", async ({
  page,
}) => {
  const email = freshEmail();
  await requestOtp(page, email);
  const actualOtp = await readLatestOtp(email, "sign-in");
  const wrongOtp = actualOtp === "000000" ? "999999" : "000000";

  await Promise.all(
    Array.from({ length: 4 }, () =>
      page.request.post("/api/auth/register/check-otp", {
        data: { email, otp: wrongOtp },
      }),
    ),
  );
  const correctAttempt = await page.request.post(
    "/api/auth/register/check-otp",
    { data: { email, otp: actualOtp } },
  );

  expect(correctAttempt.status()).toBe(400);
  expect(await userExists(email)).toBe(false);
});

test("new CUHK user completes registration and can sign in independently", async ({
  page,
  browser,
  request,
}) => {
  const email = freshEmail();
  const password = "register-flow-pw";
  await requestOtp(page, email);
  await submitProfile(page, await readLatestOtp(email, "sign-in"), password);

  await expect(page).toHaveURL(/\/wiki$/);
  await expect(
    page.getByRole("heading", { name: "你的中大百科全书", level: 1 }),
  ).toBeVisible();
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
  await expect(loginPage).toHaveURL(/\/wiki$/);
  await context.close();

  const duplicate = await request.post("/api/auth/register", {
    data: {
      email,
      otp: "000000",
      password: "replacement-password",
      nickname: "覆盖账户",
    },
  });
  expect(duplicate.status()).toBe(409);

  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  expect(login.status()).toBe(200);
});
