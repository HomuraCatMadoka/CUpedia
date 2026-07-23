import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedirect, mockGetSession, mockDbQueryUsers, mockHeaders } =
  vi.hoisted(() => ({
    mockRedirect: vi.fn(),
    mockGetSession: vi.fn(),
    mockDbQueryUsers: { findFirst: vi.fn() },
    mockHeaders: vi.fn().mockResolvedValue(new Headers()),
  }));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (opts: unknown) => mockGetSession(opts),
    },
  },
}));

vi.mock("@/db", () => ({
  db: {
    query: { users: mockDbQueryUsers },
  },
}));

import {
  requireAuth,
  getOptionalUser,
  getSessionVoterUser,
} from "@/lib/auth-guard";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("redirects to /login when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("propagates session lookup failures instead of treating them as logout", async () => {
    mockGetSession.mockRejectedValue(new Error("FAILED_TO_GET_SESSION"));
    await expect(requireAuth()).rejects.toThrow("FAILED_TO_GET_SESSION");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when no user in session", async () => {
    mockGetSession.mockResolvedValue({ user: null });
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("rejects a currently banned DB user even if session says unbanned", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "u@cuhk.edu.hk",
        name: null,
        image: null,
      },
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
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "u@cuhk.edu.hk",
        name: null,
        image: null,
      },
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
    mockGetSession.mockResolvedValue({
      user: {
        id: "deleted-user",
        email: "u@cuhk.edu.hk",
        name: null,
        image: null,
      },
    });
    mockDbQueryUsers.findFirst.mockResolvedValue(undefined);
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login?error=banned");
  });
});

describe("getOptionalUser / getSessionVoterUser", () => {
  it("propagates session lookup failures instead of returning anonymous", async () => {
    mockGetSession.mockRejectedValue(new Error("FAILED_TO_GET_SESSION"));
    await expect(getOptionalUser()).rejects.toThrow("FAILED_TO_GET_SESSION");
    await expect(getSessionVoterUser()).rejects.toThrow(
      "FAILED_TO_GET_SESSION",
    );
  });
});
