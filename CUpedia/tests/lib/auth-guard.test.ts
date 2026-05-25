import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedirect, mockAuth, mockDbQueryUsers } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockAuth: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/db", () => ({
  db: {
    query: { users: mockDbQueryUsers },
  },
}));

import { requireAuth } from "@/lib/auth-guard";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("redirects to /login when no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when no user in session", async () => {
    mockAuth.mockResolvedValue({ user: null });
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("rejects a currently banned DB user even if JWT says unbanned", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "u@cuhk.edu.hk", banned: false, role: "user", nickname: "Test" },
    });
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      banned: true,
      role: "user",
      nickname: "Test",
    });
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login?error=banned");
  });

  it("returns user with fresh DB values when not banned", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "u@cuhk.edu.hk", banned: false, role: "user", nickname: "OldNick" },
    });
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      banned: false,
      role: "admin",
      nickname: "NewNick",
    });
    const user = await requireAuth();
    expect(user.role).toBe("admin");
    expect(user.nickname).toBe("NewNick");
    expect(user.banned).toBe(false);
  });

  it("redirects when DB user is missing", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "deleted-user", email: "u@cuhk.edu.hk", banned: false, role: "user", nickname: "X" },
    });
    mockDbQueryUsers.findFirst.mockResolvedValue(undefined);
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login?error=banned");
  });
});
