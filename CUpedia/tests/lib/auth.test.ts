import { describe, it, expect, vi, beforeEach } from "vitest";
import { isAllowedEmail } from "@/lib/email";

const { mockDbQueryUsers } = vi.hoisted(() => ({
  mockDbQueryUsers: { findFirst: vi.fn() },
}));

vi.mock("@/db", () => ({
  db: { query: { users: mockDbQueryUsers } },
}));

import { checkSignIn, refreshTokenFromDb } from "@/lib/auth-callbacks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth domain restriction", () => {
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
});

describe("checkSignIn", () => {
  it("rejects user with no email", async () => {
    expect(await checkSignIn({ id: "1" })).toBe(false);
  });

  it("rejects non-CUHK email", async () => {
    expect(await checkSignIn({ id: "1", email: "user@gmail.com" })).toBe(false);
  });

  it("rejects banned user consuming a valid magic link", async () => {
    mockDbQueryUsers.findFirst.mockResolvedValue({ banned: true });
    expect(
      await checkSignIn({ id: "1", email: "user@cuhk.edu.hk" })
    ).toBe(false);
  });

  it("allows non-banned existing user", async () => {
    mockDbQueryUsers.findFirst.mockResolvedValue({ banned: false });
    expect(
      await checkSignIn({ id: "1", email: "user@cuhk.edu.hk" })
    ).toBe(true);
  });

  it("allows new user (no DB row yet)", async () => {
    mockDbQueryUsers.findFirst.mockResolvedValue(undefined);
    expect(
      await checkSignIn({ id: "1", email: "new@cuhk.edu.hk" })
    ).toBe(true);
  });
});

describe("refreshTokenFromDb", () => {
  it("returns token unchanged when trigger is not update", async () => {
    const token = { sub: "1", role: "user", nickname: "A", banned: false };
    const result = await refreshTokenFromDb(token, undefined);
    expect(result).toEqual(token);
  });

  it("refreshes role/nickname/banned from DB on trigger=update", async () => {
    const token = { sub: "1", role: "user", nickname: "Old", banned: false };
    mockDbQueryUsers.findFirst.mockResolvedValue({
      role: "admin",
      nickname: "New",
      banned: true,
    });
    const result = await refreshTokenFromDb(token, "update");
    expect(result.role).toBe("admin");
    expect(result.nickname).toBe("New");
    expect(result.banned).toBe(true);
  });

  it("keeps token unchanged if DB user not found on update", async () => {
    const token = { sub: "1", role: "user", nickname: "Old", banned: false };
    mockDbQueryUsers.findFirst.mockResolvedValue(undefined);
    const result = await refreshTokenFromDb(token, "update");
    expect(result).toEqual(token);
  });

  it("does nothing if token.sub is missing", async () => {
    const token = { role: "user", nickname: "Old", banned: false };
    const result = await refreshTokenFromDb(token, "update");
    expect(result).toEqual(token);
    expect(mockDbQueryUsers.findFirst).not.toHaveBeenCalled();
  });
});
