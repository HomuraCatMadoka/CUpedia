import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbInsert,
  mockDbDelete,
  mockDbSelect,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetSession: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbSelect: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
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
    insert: (...args: unknown[]) => mockDbInsert(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

import { resetDanmakuRateLimitForTests } from "@/lib/danmaku-rate-limit";
import {
  adminDeleteDanmaku,
  createDanmakuAsUser,
} from "@/lib/danmaku-actions";

function mockAuthUser() {
  mockGetSession.mockResolvedValue({
    user: { id: "user-1", email: "user@test.com" },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id: "user-1",
    email: "user@test.com",
    nickname: "Tester",
    role: "user",
    banned: false,
  });
}

describe("danmaku-actions", () => {
  beforeEach(() => {
    resetDanmakuRateLimitForTests();
    vi.clearAllMocks();
    process.env.DANMAKU_RATE_LIMIT_PER_HOUR = "10";
  });

  afterEach(() => {
    resetDanmakuRateLimitForTests();
  });

  it("createDanmakuAsUser inserts row for current month", async () => {
    const now = new Date();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "dm-1",
        userId: "user-1",
        content: "期末加油",
        month: "2026-07",
        createdAt: now,
      },
    ]);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning }),
    });

    const row = await createDanmakuAsUser(
      { id: "user-1", nickname: "Tester" },
      "期末加油",
    );
    expect(row.content).toBe("期末加油");
    expect(row.authorNickname).toBe("Tester");
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("rejects when rate limit exceeded", async () => {
    process.env.DANMAKU_RATE_LIMIT_PER_HOUR = "1";
    const returning = vi.fn().mockResolvedValue([
      {
        id: "dm-1",
        userId: "user-1",
        content: "a",
        month: "2026-07",
        createdAt: new Date(),
      },
    ]);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning }),
    });

    await createDanmakuAsUser({ id: "user-1", nickname: "T" }, "a");
    await expect(
      createDanmakuAsUser({ id: "user-1", nickname: "T" }, "b"),
    ).rejects.toThrow("DANMAKU_RATE_LIMIT_EXCEEDED");
  });

  it("adminDeleteDanmaku hard-deletes row", async () => {
    mockAuthUser();
    mockDbQueryUsers.findFirst.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@test.com",
      nickname: "Admin",
      role: "admin",
      banned: false,
    });
    mockGetSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@test.com" },
    });

    const returning = vi.fn().mockResolvedValue([{ id: "dm-1" }]);
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });

    await adminDeleteDanmaku("dm-1");
    expect(mockDbDelete).toHaveBeenCalled();
  });
});
