import { describe, it, expect } from "vitest";
import { normalizeEmail, parseEmail, isAllowedEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Student@LINK.CUHK.EDU.HK  ")).toBe(
      "student@link.cuhk.edu.hk"
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
  it("allows @link.cuhk.edu.hk", () => {
    expect(isAllowedEmail("student@link.cuhk.edu.hk")).toBe(true);
  });

  it("allows @cuhk.edu.hk", () => {
    expect(isAllowedEmail("prof@cuhk.edu.hk")).toBe(true);
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
    expect(isAllowedEmail(" Student@LINK.CUHK.EDU.HK ")).toBe(true);
  });

  it("uses parseEmail internally — rejects malformed", () => {
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail("@@cuhk.edu.hk")).toBe(false);
  });
});
