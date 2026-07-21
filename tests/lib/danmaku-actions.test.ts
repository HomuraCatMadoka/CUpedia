import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbDelete,
  mockInsert,
  mockRevalidatePath,
  mockAssertContributorComplete,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetSession: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
  mockDbDelete: vi.fn(),
  mockInsert: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockAssertContributorComplete: vi.fn(async (user) => user),
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
    delete: (...args: unknown[]) => mockDbDelete(...args),
  },
}));

vi.mock("@/lib/danmaku-mutations", () => ({
  insertDanmakuForUser: (...args: unknown[]) => mockInsert(...args),
}));

vi.mock("@/lib/contributor-account", () => ({
  assertContributorComplete: (user: unknown) =>
    mockAssertContributorComplete(user),
}));

import { adminDeleteDanmaku, createDanmaku } from "@/lib/danmaku-actions";
import { canteenDanmakuMessages, danmakuMessages } from "@/db/schema";

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
    vi.clearAllMocks();
  });

  it("createDanmaku requires auth and delegates to insert helper", async () => {
    mockAuthUser();
    mockInsert.mockResolvedValue({
      id: "dm-1",
      userId: "user-1",
      content: "加油",
      month: "2026-07",
      authorNickname: "Tester",
      createdAt: new Date(),
    });

    const row = await createDanmaku("加油");
    expect(row.content).toBe("加油");
    expect(mockInsert).toHaveBeenCalledWith(
      { id: "user-1", nickname: "Tester" },
      "加油",
    );
  });

  it("createDanmaku redirects anonymous callers", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(createDanmaku("x")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("createDanmaku blocks incomplete accounts before insertion", async () => {
    mockAuthUser();
    mockAssertContributorComplete.mockRejectedValueOnce(
      new Error("ACCOUNT_SETUP_REQUIRED"),
    );

    await expect(createDanmaku("x")).rejects.toThrow("ACCOUNT_SETUP_REQUIRED");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("adminDeleteDanmaku hard-deletes a hub row", async () => {
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

    await adminDeleteDanmaku({ id: "dm-1", scope: "hub" });
    expect(mockDbDelete).toHaveBeenCalledWith(danmakuMessages);
  });

  it("adminDeleteDanmaku hard-deletes a canteen row and revalidates it", async () => {
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

    await adminDeleteDanmaku({
      id: "dm-1",
      scope: "canteen",
      canteenId: "00000000-0000-4000-a000-000000000001",
    });

    expect(mockDbDelete).toHaveBeenCalledWith(canteenDanmakuMessages);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/canteen/00000000-0000-4000-a000-000000000001",
    );
  });
});
