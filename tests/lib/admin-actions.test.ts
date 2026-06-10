import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbExecute,
  mockDbTransaction,
  mockRevalidatePath,
  mockDbQueryUsers,
  mockHeaders,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetSession: vi.fn(),
  mockDbExecute: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn(), findMany: vi.fn() },
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

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
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
    execute: (...args: unknown[]) => mockDbExecute(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockDbTransaction(fn),
  },
}));

import { getUsers, setUserBanned, setUserRole } from "@/lib/admin-actions";
import { escapeLikePattern } from "@/lib/utils";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAdminSession(id = "admin-1", role = "admin") {
  mockGetSession.mockResolvedValue({
    user: {
      id,
      role,
      email: "admin@cuhk.edu.hk",
      name: null,
      image: null,
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
  mockGetSession.mockResolvedValue({
    user: {
      id: "user-1",
      email: "user@cuhk.edu.hk",
      name: null,
      image: null,
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
  mockGetSession.mockResolvedValue(null);
}

// The caller is the site Owner: an admin whose id is recorded in
// siteSettings.owner_user_id (read fresh via db.execute → mockDbExecute).
function mockOwnerSession(id = "owner-1") {
  mockAdminSession(id);
  mockDbExecute.mockResolvedValue([{ value: id }]);
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
    expect(mockGetSession).toHaveBeenCalled();
  });
});

describe("setUserBanned", () => {
  it("rejects non-admin caller", async () => {
    mockNonAdminSession();
    await expect(setUserBanned("user-2", true)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("rejects banning self (an admin)", async () => {
    mockAdminSession("admin-1");
    const self = {
      id: "admin-1",
      role: "admin",
      banned: false,
      updated_at: new Date("2026-01-01"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = { execute: vi.fn().mockResolvedValueOnce([self]) };
      return fn(tx);
    });
    await expect(setUserBanned("admin-1", true)).rejects.toThrow(
      "CANNOT_BAN_ADMIN",
    );
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

  it("rejects banning an admin", async () => {
    mockAdminSession("admin-1");
    const targetAdmin = {
      id: "admin-2",
      role: "admin",
      banned: false,
      updated_at: new Date("2026-01-01"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = { execute: vi.fn().mockResolvedValueOnce([targetAdmin]) };
      return fn(tx);
    });
    await expect(setUserBanned("admin-2", true)).rejects.toThrow(
      "CANNOT_BAN_ADMIN",
    );
  });

  it("rejects banning the owner (an admin)", async () => {
    mockAdminSession("admin-1");
    const owner = {
      id: "owner-1",
      role: "admin",
      banned: false,
      updated_at: new Date("2026-01-01"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = { execute: vi.fn().mockResolvedValueOnce([owner]) };
      return fn(tx);
    });
    await expect(setUserBanned("owner-1", true)).rejects.toThrow(
      "CANNOT_BAN_ADMIN",
    );
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

  it("unbans a banned admin (unban path unaffected by the ban guard)", async () => {
    mockAdminSession("admin-1");
    const bannedAdmin = {
      id: "admin-2",
      role: "admin",
      banned: true,
      updated_at: new Date("2026-01-01"),
    };
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = {
        execute: vi
          .fn()
          .mockResolvedValueOnce([bannedAdmin])
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });
    await expect(setUserBanned("admin-2", false)).resolves.not.toThrow();
  });
});

describe("setUserRole", () => {
  it("rejects a non-owner admin caller", async () => {
    mockAdminSession("admin-2");
    mockDbExecute.mockResolvedValue([{ value: "owner-1" }]);
    await expect(setUserRole("user-2", "admin")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("promotes a regular user to admin and revalidates", async () => {
    mockOwnerSession("owner-1");
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
    await expect(setUserRole("user-2", "admin")).resolves.not.toThrow();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("rejects the owner changing their own role", async () => {
    mockOwnerSession("owner-1");
    await expect(setUserRole("owner-1", "user")).rejects.toThrow(
      "SELF_ROLE_CHANGE",
    );
  });

  it("rejects an invalid role value", async () => {
    mockOwnerSession("owner-1");
    await expect(
      setUserRole("user-2", "superadmin" as unknown as "admin" | "user"),
    ).rejects.toThrow("INVALID_ROLE");
  });

  it("rejects promoting a banned user to admin", async () => {
    mockOwnerSession("owner-1");
    const target = {
      id: "user-3",
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
    await expect(setUserRole("user-3", "admin")).rejects.toThrow("USER_BANNED");
  });

  it("rejects a stale expectedUpdatedAt", async () => {
    mockOwnerSession("owner-1");
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
      setUserRole("user-2", "admin", "2026-01-01T00:00:00.000Z"),
    ).rejects.toThrow("STALE_USER_ROW");
  });

  it("rejects an unknown target user", async () => {
    mockOwnerSession("owner-1");
    mockDbTransaction.mockImplementation(async (fn) => {
      const tx = { execute: vi.fn().mockResolvedValueOnce([]) };
      return fn(tx);
    });
    await expect(setUserRole("ghost", "admin")).rejects.toThrow(
      "USER_NOT_FOUND",
    );
  });

  it("demotes an admin to user and revalidates", async () => {
    mockOwnerSession("owner-1");
    const target = {
      id: "admin-2",
      role: "admin",
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
    await expect(setUserRole("admin-2", "user")).resolves.not.toThrow();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("rejects role management when no owner is set", async () => {
    mockAdminSession("admin-1");
    mockDbExecute.mockResolvedValue([]);
    await expect(setUserRole("user-2", "admin")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});
