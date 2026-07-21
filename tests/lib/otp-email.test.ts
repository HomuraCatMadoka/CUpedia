import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOtpEmail } from "@/lib/otp-email";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("sendOtpEmail", () => {
  it("uses a no-network delivery sink under e2e", async () => {
    process.env.E2E_TEST = "1";
    process.env.AUTH_URL = "http://127.0.0.1:3100";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_deadbeef";
    delete process.env.BREVO_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendOtpEmail({
        email: "1155000000@link.cuhk.edu.hk",
        otp: "123456",
        type: "sign-in",
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not suppress delivery merely because E2E_TEST is set on a remote origin", async () => {
    process.env.E2E_TEST = "1";
    process.env.AUTH_URL = "https://cupedia.example";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_deadbeef";
    delete process.env.BREVO_API_KEY;

    await expect(
      sendOtpEmail({
        email: "1155000000@link.cuhk.edu.hk",
        otp: "123456",
        type: "sign-in",
      }),
    ).rejects.toThrow("BREVO_API_KEY");
  });

  it("does not suppress delivery for a local origin using a non-E2E database", async () => {
    process.env.E2E_TEST = "1";
    process.env.AUTH_URL = "http://localhost:3000";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5433/cuclaw";
    delete process.env.BREVO_API_KEY;

    await expect(
      sendOtpEmail({
        email: "1155000000@link.cuhk.edu.hk",
        otp: "123456",
        type: "sign-in",
      }),
    ).rejects.toThrow("BREVO_API_KEY");
  });

  it("still requires Brevo configuration outside e2e", async () => {
    delete process.env.E2E_TEST;
    delete process.env.BREVO_API_KEY;

    await expect(
      sendOtpEmail({
        email: "1155000000@link.cuhk.edu.hk",
        otp: "123456",
        type: "sign-in",
      }),
    ).rejects.toThrow("BREVO_API_KEY");
  });

  it("delivers the generated OTP through Brevo outside e2e", async () => {
    delete process.env.E2E_TEST;
    process.env.BREVO_API_KEY = "test-key";
    process.env.EMAIL_FROM = "noreply@example.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendOtpEmail({
      email: "1155000000@link.cuhk.edu.hk",
      otp: "654321",
      type: "sign-in",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: {
          "api-key": "test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).toContain("654321");
    expect(fetchMock.mock.calls[0][1].body).toContain("10 分钟内有效");
  });
});
