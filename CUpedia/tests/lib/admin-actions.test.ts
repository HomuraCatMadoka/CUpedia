import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockAuth,
  mockDbExecute,
  mockDbTransaction,
  mockRevalidatePath,
  mockDbQueryUsers,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockAuth: vi.fn(),
  mockDbExecute: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn(), findMany: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/db", () => ({
  db: {
    query: { users: mockDbQueryUsers },
    execute: (...args: unknown[]) => mockDbExecute(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockDbTransaction(fn),
  },
}));

import { getUsers, setUserBanned } from "@/lib/admin-actions";
import { escapeLikePattern } from "@/lib/utils";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAdminSession(id = "admin-1", role = "admin") {
  mockAuth.mockResolvedValue({
    user: {
      id,
      role,
      email: "admin@cuhk.edu.hk",
      nickname: "Admin",
      banned: false,
    },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id,
    email: "admin@cuhk.edu.hk",
    nickname: "Admin",
    role,
    banned: false,
  });
}

function mockNonAdminSession() {
  mockAuth.mockResolvedValue({
    user: {
      id: "user-1",
      role: "user",
      email: "user@cuhk.edu.hk",
      nickname: "User",
      banned: false,
    },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id: "user-1",
    email: "user@cuhk.edu.hk",
    nickname: "User",
    role: "user",
    banned: false,
  });
}

function mockNoSession() {
  mockAuth.mockResolvedValue(null);
}

describe("escapeLikePattern", () => {
  it("escapes % wildcard", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
  });

  it("escapes _ wildcard", () => {
    expect(escapeLikePattern("user_name")).toBe("user\\_name");
  });

  it("escapes backslash", () => {
    expect(escapeLikePattern("path\\to")).toBe("path\\\\to");
  });

  it("escapes all special characters together", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("returns plain strings unchanged", () => {
    expect(escapeLikePattern("hello")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(escapeLikePattern("")).toBe("");
  });
});

describe("getUsers", () => {
  it("rejects non-admin caller", async () => {
    mockNonAdminSession();
    await expect(getUsers({ page: 1, pageSize: 10 })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("rejects unauthenticated caller", async () => {
    mockNoSession();
    await expect(getUsers({ page: 1, pageSize: 10 })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("calls requireAdmin internally", async () => {
    mockAdminSession();
    mockDbExecute.mockResolvedValue([{ count: 0 }]);
    await getUsers({ page: 1, pageSize: 10 });
    expect(mockAuth).toHaveBeenCalled();
  });
});

describe("setUserBanned", () => {
  it("rejects non-admin caller", async () => {
    mockNonAdminSession();
    await expect(setUserBanned("user-2", true)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("rejects banning self", async () => {
    mockAdminSession("admin-1");
    await expect(setUserBanned("admin-1", true)).rejects.toThrow("SELF_BAN");
  });

  it("rejects banning nonexistent user", async () => {
    mockAdminSession("admin-1");
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = {
        execute: vi.fn().mockResolvedValueOnce([]),
      };
      return fn(tx);
    });
    await expect(setUserBanned("nonexistent", true)).rejects.toThrow(
      "USER_NOT_FOUND",
    );
  });

  it("rejects banning the last active admin", async () => {
    mockAdminSession("admin-1");
    const targetAdmin = {
      id: "admin-2",
      role: "admin",
      banned: false,
      updated_at: new Date("2026-01-01"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = {
        execute: vi
          .fn()
          .mockResolvedValueOnce([targetAdmin])
          .mockResolvedValueOnce([{ count: 1 }]),
      };
      return fn(tx);
    });
    await expect(setUserBanned("admin-2", true)).rejects.toThrow("LAST_ADMIN");
  });

  it("rejects stale expectedUpdatedAt", async () => {
    mockAdminSession("admin-1");
    const target = {
      id: "user-2",
      role: "user",
      banned: false,
      updated_at: new Date("2026-01-02"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = { execute: vi.fn().mockResolvedValueOnce([target]) };
      return fn(tx);
    });
    await expect(
      setUserBanned("user-2", true, "2026-01-01T00:00:00.000Z"),
    ).rejects.toThrow("STALE_USER_ROW");
  });

  it("bans a regular user successfully", async () => {
    mockAdminSession("admin-1");
    const target = {
      id: "user-2",
      role: "user",
      banned: false,
      updated_at: new Date("2026-01-01"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = {
        execute: vi
          .fn()
          .mockResolvedValueOnce([target])
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });
    await expect(setUserBanned("user-2", true)).resolves.not.toThrow();
  });

  it("unbans a user successfully", async () => {
    mockAdminSession("admin-1");
    const target = {
      id: "user-2",
      role: "user",
      banned: true,
      updated_at: new Date("2026-01-01"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = {
        execute: vi
          .fn()
          .mockResolvedValueOnce([target])
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });
    await expect(setUserBanned("user-2", false)).resolves.not.toThrow();
  });
});
