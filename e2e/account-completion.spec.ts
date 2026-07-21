import { randomInt } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  ageLatestSession,
  createEmptyCredentialAccount,
  createOtpOnlyUser,
  setUserNickname,
} from "./helpers/otp";
import { loginWithPassword } from "./helpers/auth";
import { LOCAL_E2E_OTP } from "@/lib/e2e-otp";

function freshEmail() {
  return `1155${randomInt(1_000_000).toString().padStart(6, "0")}@link.cuhk.edu.hk`;
}

async function loginWithOtp(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/login");
  await page.getByRole("button", { name: "验证码登录" }).click();
  await page.getByLabel("CUHK 邮箱").fill(email);
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByLabel("验证码").fill(LOCAL_E2E_OTP);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL("/");
}

async function triggerDanmaku(
  page: import("@playwright/test").Page,
  draft: string,
) {
  await page.goto("/canteen");
  await page.getByLabel("弹幕内容").fill(draft);
  await page.getByRole("button", { name: "发送" }).click();
  return page.getByRole("dialog", { name: "完善账户后继续" });
}

test("legacy OTP-only user completes nickname and password in place before publishing", async ({
  page,
}) => {
  const email = freshEmail();
  const password = "completed-password";
  const draft = `保留草稿-${randomInt(1_000_000)}`;
  await createOtpOnlyUser(email);

  await loginWithOtp(page, email);
  const dialog = await triggerDanmaku(page, draft);
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("弹幕内容")).toHaveValue(draft);
  await dialog.getByLabel("昵称").fill("补全用户");
  await dialog.getByLabel("新密码", { exact: true }).fill(password);
  await dialog.getByLabel("确认新密码").fill(password);
  await dialog.getByRole("button", { name: "完成并继续" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.locator(".danmaku-track-layer .danmaku-item", { hasText: draft }),
  ).toBeVisible();
  await expect(page.getByLabel("弹幕内容")).toHaveValue("");

  await page.context().clearCookies();
  await loginWithPassword(page, email, password);
  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json()).user).toMatchObject({
    email,
    nickname: "补全用户",
  });
});

test("OTP-only user with a nickname is asked for only a password", async ({
  page,
}) => {
  const email = freshEmail();
  const password = "completed-password";
  const draft = `只补密码-${randomInt(1_000_000)}`;
  await createOtpOnlyUser(email, "已有昵称");
  await loginWithOtp(page, email);

  const dialog = await triggerDanmaku(page, draft);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("昵称")).toHaveCount(0);
  await dialog.getByLabel("新密码", { exact: true }).fill(password);
  await dialog.getByLabel("确认新密码").fill(password);
  await dialog.getByRole("button", { name: "完成并继续" }).click();

  await expect(
    page.locator(".danmaku-track-layer .danmaku-item", { hasText: draft }),
  ).toBeVisible();
});

test("an empty legacy credential is treated as a missing password", async ({
  page,
}) => {
  const email = freshEmail();
  const draft = `空密码记录-${randomInt(1_000_000)}`;
  const userId = await createOtpOnlyUser(email, "已有昵称");
  await createEmptyCredentialAccount(userId);
  await loginWithOtp(page, email);

  const dialog = await triggerDanmaku(page, draft);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("昵称")).toHaveCount(0);
  await expect(dialog.getByLabel("新密码", { exact: true })).toBeVisible();
});

test("password user with an empty nickname is asked for only a nickname", async ({
  page,
}) => {
  const email = freshEmail();
  const password = "registered-password";
  const draft = `只补昵称-${randomInt(1_000_000)}`;
  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password, name: "原昵称", nickname: "原昵称" },
  });
  expect(signup.ok()).toBe(true);
  const verification = await page.request.post(
    "/api/auth/email-otp/verify-email",
    {
      data: { email, otp: LOCAL_E2E_OTP },
    },
  );
  expect(verification.ok()).toBe(true);
  await setUserNickname(email, "");

  const dialog = await triggerDanmaku(page, draft);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("新密码")).toHaveCount(0);
  await dialog.getByLabel("昵称").fill("补回昵称");
  await dialog.getByRole("button", { name: "完成并继续" }).click();

  await expect(
    page.locator(".danmaku-track-layer .danmaku-item", { hasText: draft }),
  ).toBeVisible();
});

test("an old but valid session can complete its account without losing the draft", async ({
  page,
}) => {
  const email = freshEmail();
  const draft = `旧会话草稿-${randomInt(1_000_000)}`;
  await createOtpOnlyUser(email);
  await loginWithOtp(page, email);
  await ageLatestSession(email);

  const dialog = await triggerDanmaku(page, draft);
  await dialog.getByLabel("昵称").fill("旧会话用户");
  await dialog.getByLabel("新密码", { exact: true }).fill("completed-password");
  await dialog.getByLabel("确认新密码").fill("completed-password");
  await dialog.getByRole("button", { name: "完成并继续" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("弹幕内容")).toHaveValue("");
  await expect(
    page.locator(".danmaku-track-layer .danmaku-item", { hasText: draft }),
  ).toBeVisible();
});
