import { describe, it, expect } from "vitest";
import { isAllowedEmail } from "@/lib/email";

describe("auth domain restriction", () => {
  it("allows @link.cuhk.edu.hk with valid student ID", () => {
    expect(isAllowedEmail("1155123456@link.cuhk.edu.hk")).toBe(true);
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
    expect(isAllowedEmail(" 1155123456@LINK.CUHK.EDU.HK ")).toBe(true);
  });
});
