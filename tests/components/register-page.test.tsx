/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push, refresh, signUpEmail, verifyEmail, sendVerificationOtp } =
  vi.hoisted(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
    signUpEmail: vi.fn(),
    verifyEmail: vi.fn(),
    sendVerificationOtp: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: { email: signUpEmail },
    emailOtp: { verifyEmail, sendVerificationOtp },
  },
}));

import RegisterPage from "@/app/(auth)/register/page";

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SKIP_EMAIL_WHITELIST;
    signUpEmail.mockResolvedValue({ error: null });
    verifyEmail.mockResolvedValue({ error: null });
    sendVerificationOtp.mockResolvedValue({ error: null });
  });

  it("collects the complete account profile before email verification", () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText("CUHK 邮箱")).toBeTruthy();
    expect(screen.getByLabelText("昵称")).toBeTruthy();
    expect(screen.getByLabelText("密码", { selector: "input" })).toBeTruthy();
    expect(screen.getByLabelText("确认密码")).toBeTruthy();
    expect(screen.getByRole("button", { name: "注册" })).toBeTruthy();
    expect(screen.queryByLabelText("验证码")).toBeNull();
  });

  it("creates a complete unverified account before asking for the OTP", async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "1155123456@link.cuhk.edu.hk" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() =>
      expect(signUpEmail).toHaveBeenCalledWith({
        email: "1155123456@link.cuhk.edu.hk",
        password: "password123",
        name: "测试用户",
        nickname: "测试用户",
      }),
    );
    expect(await screen.findByLabelText("验证码")).toBeTruthy();
  });

  it("verifies the registration OTP and enters the app", async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "1155123456@link.cuhk.edu.hk" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    fireEvent.change(await screen.findByLabelText("验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));

    await waitFor(() =>
      expect(verifyEmail).toHaveBeenCalledWith({
        email: "1155123456@link.cuhk.edu.hk",
        otp: "123456",
      }),
    );
    expect(push).toHaveBeenCalledWith("/");
    expect(refresh).toHaveBeenCalled();
  });

  it("maps provider OTP errors to an understandable message", async () => {
    verifyEmail.mockResolvedValueOnce({
      error: { message: "Invalid OTP" },
    });
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "1155123456@link.cuhk.edu.hk" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    fireEvent.change(await screen.findByLabelText("验证码"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));

    expect(await screen.findByText("验证码无效或已过期")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("resends an email-verification OTP without creating another user", async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "1155123456@link.cuhk.edu.hk" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    fireEvent.click(await screen.findByRole("button", { name: "重新发送" }));

    await waitFor(() =>
      expect(sendVerificationOtp).toHaveBeenCalledWith({
        email: "1155123456@link.cuhk.edu.hk",
        type: "email-verification",
      }),
    );
  });

  it("recovers the form when signup fails at the network boundary", async () => {
    signUpEmail.mockRejectedValueOnce(new Error("network down"));
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "1155123456@link.cuhk.edu.hk" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByText("注册失败，请稍后重试")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "注册" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("recovers the OTP form when verification fails at the network boundary", async () => {
    verifyEmail.mockRejectedValueOnce(new Error("network down"));
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "1155123456@link.cuhk.edu.hk" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    fireEvent.change(await screen.findByLabelText("验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));

    expect(await screen.findByText("验证失败，请稍后重试")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "验证并登录",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("recovers the OTP form when resend fails at the network boundary", async () => {
    sendVerificationOtp.mockRejectedValueOnce(new Error("network down"));
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "1155123456@link.cuhk.edu.hk" },
    });
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "测试用户" },
    });
    fireEvent.change(screen.getByLabelText("密码", { selector: "input" }), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    fireEvent.click(await screen.findByRole("button", { name: "重新发送" }));

    expect(await screen.findByText("验证码发送失败，请稍后重试")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "重新发送",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
