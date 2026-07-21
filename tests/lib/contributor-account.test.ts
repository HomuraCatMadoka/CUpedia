import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAuth, mockAccountFindFirst } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockAccountFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      accounts: { findFirst: mockAccountFindFirst },
    },
  },
}));

import {
  AccountSetupRequiredError,
  assertContributorComplete,
  requireCompleteContributor,
} from "@/lib/contributor-account";

describe("requireCompleteContributor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      id: "otp-user",
      nickname: "",
      role: "user",
      banned: false,
    });
    mockAccountFindFirst.mockResolvedValue(undefined);
  });

  it("reports both missing fields for an OTP-only user with no nickname", async () => {
    await expect(requireCompleteContributor()).rejects.toEqual(
      new AccountSetupRequiredError({
        nickname: true,
        password: true,
      }),
    );
  });

  it("asks a password user with an empty nickname for only a nickname", async () => {
    mockAccountFindFirst.mockResolvedValue({ id: "credential-account" });

    await expect(requireCompleteContributor()).rejects.toEqual(
      new AccountSetupRequiredError({
        nickname: true,
        password: false,
      }),
    );
  });

  it("asks an OTP-only user with a nickname for only a password", async () => {
    mockRequireAuth.mockResolvedValue({
      id: "otp-user",
      nickname: "已有昵称",
      role: "user",
      banned: false,
    });

    await expect(requireCompleteContributor()).rejects.toEqual(
      new AccountSetupRequiredError({
        nickname: false,
        password: true,
      }),
    );
  });

  it("returns a contributor whose nickname and password are complete", async () => {
    const user = {
      id: "complete-user",
      nickname: "完整用户",
      role: "user",
      banned: false,
    };
    mockRequireAuth.mockResolvedValue(user);
    mockAccountFindFirst.mockResolvedValue({ id: "credential-account" });

    await expect(requireCompleteContributor()).resolves.toBe(user);
  });

  it("can guard a user already authenticated by a more specific permission check", async () => {
    const editor = { id: "editor", nickname: "完整编辑者", role: "user" };
    mockAccountFindFirst.mockResolvedValue({ id: "credential-account" });

    await expect(assertContributorComplete(editor)).resolves.toBe(editor);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });
});
