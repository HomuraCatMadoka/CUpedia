/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hoisted so the vi.mock factories can reference them.
const { signInEmail, push, refresh, sendVerificationOtp } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  sendVerificationOtp: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: signInEmail },
    emailOtp: { sendVerificationOtp },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import LoginPage from "@/app/(auth)/login/page";

describe("LoginPage password sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInEmail.mockResolvedValue({ error: null });
    // Mirror the browser: SKIP_EMAIL_WHITELIST is server-only (not NEXT_PUBLIC_),
    // so isAllowedEmail("user@test.com") is false here — exactly the condition
    // that the removed client gate used to reject.
    delete process.env.SKIP_EMAIL_WHITELIST;
  });

  // Regression for #182: the password form must not domain-gate the submit.
  // Seed accounts (@test.com) are not CUHK domains; the old client check
  // blocked them with "仅支持 CUHK 邮箱" and never called better-auth.
  it("submits a @test.com seed account to better-auth without a domain gate", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("CUHK 邮箱"), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^登录$/ }));

    await waitFor(() =>
      expect(signInEmail).toHaveBeenCalledWith({
        email: "user@test.com",
        password: "password123",
      }),
    );
    expect(screen.queryByText("仅支持 CUHK 邮箱")).toBeNull();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/wiki"));
  });
});
