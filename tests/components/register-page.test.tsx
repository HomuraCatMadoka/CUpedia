/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push, refresh, signUpEmail } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signUpEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUpEmail } },
}));

import RegisterPage from "@/app/(auth)/register/page";

const EMAIL = "1155123456@link.cuhk.edu.hk";
const PASSWORD = "password123";

function submitSignup(confirmPassword = PASSWORD) {
  fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
    target: { value: EMAIL },
  });
  fireEvent.change(screen.getByLabelText("昵称"), {
    target: { value: "测试用户" },
  });
  fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
    target: { value: PASSWORD },
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: "注册" }));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SKIP_EMAIL_WHITELIST;
    signUpEmail.mockResolvedValue({ error: null });
  });

  it("submits the complete account and enters the app immediately", async () => {
    render(<RegisterPage />);
    submitSignup();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(refresh).toHaveBeenCalled();
    expect(signUpEmail).toHaveBeenCalledExactlyOnceWith({
      email: EMAIL,
      password: PASSWORD,
      name: "测试用户",
      nickname: "测试用户",
    });
    expect(screen.queryByLabelText("验证码")).toBeNull();
  });

  it("requires matching password confirmation before submitting", () => {
    render(<RegisterPage />);
    submitSignup("another-password");

    expect(screen.getByText("两次输入的密码不一致")).toBeTruthy();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("directs an existing user to login or recovery", async () => {
    signUpEmail.mockResolvedValueOnce({
      error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
    render(<RegisterPage />);
    submitSignup();

    expect(
      await screen.findByText("这个邮箱已有账号，请登录或找回密码"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "登录" }).getAttribute("href"),
    ).toBe("/login");
    expect(
      screen.getByRole("link", { name: "找回密码" }).getAttribute("href"),
    ).toBe("/reset-password");
    expect(push).not.toHaveBeenCalled();
  });

  it("recovers the form when signup fails at the network boundary", async () => {
    signUpEmail.mockRejectedValueOnce(new Error("network down"));
    render(<RegisterPage />);
    submitSignup();

    expect(await screen.findByText("注册失败，请稍后重试")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "注册" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
