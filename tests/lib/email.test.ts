import { describe, it, expect, afterEach } from "vitest";
import {
  normalizeEmail,
  parseEmail,
  isAllowedEmail,
  shouldRejectOtpRequest,
} from "@/lib/email";

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Student@LINK.CUHK.EDU.HK  ")).toBe(
      "student@link.cuhk.edu.hk",
    );
  });

  it("handles already-normalized input", () => {
    expect(normalizeEmail("user@cuhk.edu.hk")).toBe("user@cuhk.edu.hk");
  });
});

describe("parseEmail", () => {
  it("returns normalized email for valid address", () => {
    expect(parseEmail("  User@CUHK.edu.hk  ")).toEqual({
      ok: true,
      email: "user@cuhk.edu.hk",
    });
  });

  it("rejects empty string", () => {
    expect(parseEmail("")).toEqual({ ok: false, code: "INVALID_EMAIL" });
  });

  it("rejects missing @", () => {
    expect(parseEmail("userexample.com")).toEqual({
      ok: false,
      code: "INVALID_EMAIL",
    });
  });

  it("rejects multiple @", () => {
    expect(parseEmail("user@@example.com")).toEqual({
      ok: false,
      code: "INVALID_EMAIL",
    });
  });

  it("rejects @ at start", () => {
    expect(parseEmail("@example.com")).toEqual({
      ok: false,
      code: "INVALID_EMAIL",
    });
  });

  it("rejects missing domain", () => {
    expect(parseEmail("user@")).toEqual({ ok: false, code: "INVALID_EMAIL" });
  });

  it("does not throw on malformed input", () => {
    expect(() => parseEmail("not-an-email")).not.toThrow();
  });
});

describe("isAllowedEmail", () => {
  it("allows 10-digit 1155 prefix @link.cuhk.edu.hk", () => {
    expect(isAllowedEmail("1155123456@link.cuhk.edu.hk")).toBe(true);
  });

  it("rejects non-digit prefix @link.cuhk.edu.hk", () => {
    expect(isAllowedEmail("john.doe@link.cuhk.edu.hk")).toBe(false);
  });

  it("rejects fewer than 10 digits @link.cuhk.edu.hk", () => {
    expect(isAllowedEmail("12345@link.cuhk.edu.hk")).toBe(false);
  });

  it("rejects 1155 prefix with only 9 digits @link.cuhk.edu.hk", () => {
    expect(isAllowedEmail("115512345@link.cuhk.edu.hk")).toBe(false);
  });

  it("rejects 10 digits without 1155 prefix @link.cuhk.edu.hk", () => {
    expect(isAllowedEmail("1234567890@link.cuhk.edu.hk")).toBe(false);
  });

  it("allows any prefix @cuhk.edu.hk (staff)", () => {
    expect(isAllowedEmail("prof@cuhk.edu.hk")).toBe(true);
    expect(isAllowedEmail("staff@cuhk.edu.hk")).toBe(true);
  });

  it("rejects @gmail.com", () => {
    expect(isAllowedEmail("user@gmail.com")).toBe(false);
  });

  it("rejects subdomain spoofing", () => {
    expect(isAllowedEmail("user@fake.cuhk.edu.hk")).toBe(false);
  });

  it("rejects @link.cuhk.edu.hk.evil.com", () => {
    expect(isAllowedEmail("user@link.cuhk.edu.hk.evil.com")).toBe(false);
  });

  it("normalizes whitespace and case", () => {
    expect(isAllowedEmail(" 1155123456@LINK.CUHK.EDU.HK ")).toBe(true);
  });

  it("uses parseEmail internally — rejects malformed", () => {
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail("@@cuhk.edu.hk")).toBe(false);
  });

  describe("SKIP_EMAIL_WHITELIST bypass", () => {
    const originalEnv = process.env.SKIP_EMAIL_WHITELIST;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SKIP_EMAIL_WHITELIST;
      } else {
        process.env.SKIP_EMAIL_WHITELIST = originalEnv;
      }
    });

    it("bypasses all checks when SKIP_EMAIL_WHITELIST=true", () => {
      process.env.SKIP_EMAIL_WHITELIST = "true";
      expect(isAllowedEmail("anyone@gmail.com")).toBe(true);
      expect(isAllowedEmail("test@test.com")).toBe(true);
    });

    it("does not bypass when SKIP_EMAIL_WHITELIST is unset", () => {
      delete process.env.SKIP_EMAIL_WHITELIST;
      expect(isAllowedEmail("anyone@gmail.com")).toBe(false);
    });

    it("does not bypass when SKIP_EMAIL_WHITELIST=false", () => {
      process.env.SKIP_EMAIL_WHITELIST = "false";
      expect(isAllowedEmail("anyone@gmail.com")).toBe(false);
    });
  });
});

describe("shouldRejectOtpRequest", () => {
  const SEND = "/email-otp/send-verification-otp";
  const VERIFY = "/sign-in/email-otp";

  it("rejects ineligible email on the send path", () => {
    expect(shouldRejectOtpRequest(SEND, "attacker@gmail.com")).toBe(true);
  });

  it("rejects ineligible email on the verify path", () => {
    expect(shouldRejectOtpRequest(VERIFY, "attacker@gmail.com")).toBe(true);
  });

  it("allows eligible CUHK email on both gated paths", () => {
    expect(shouldRejectOtpRequest(SEND, "1155123456@link.cuhk.edu.hk")).toBe(
      false,
    );
    expect(shouldRejectOtpRequest(VERIFY, "prof@cuhk.edu.hk")).toBe(false);
  });

  it("does not gate unrelated endpoints", () => {
    expect(shouldRejectOtpRequest("/sign-in/email", "attacker@gmail.com")).toBe(
      false,
    );
  });

  it("defers missing/non-string email to better-auth validation", () => {
    expect(shouldRejectOtpRequest(SEND, undefined)).toBe(false);
    expect(shouldRejectOtpRequest(SEND, ["x@gmail.com"])).toBe(false);
  });
});
