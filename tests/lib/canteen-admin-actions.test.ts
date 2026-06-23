import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbQueryCanteens,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockDbSelect,
  mockRevalidatePath,
  mockHeaders,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetSession: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
  mockDbQueryCanteens: { findFirst: vi.fn() },
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbSelect: vi.fn(),
  mockRevalidatePath: vi.fn(),
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
    query: {
      users: mockDbQueryUsers,
      canteens: mockDbQueryCanteens,
    },
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

import { createCanteen } from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard-api";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAdminSession() {
  mockGetSession.mockResolvedValue({
    user: { id: "admin-1", email: "admin@test.com" },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id: "admin-1",
    email: "admin@test.com",
    nickname: "Admin",
    role: "admin",
    banned: false,
  });
}

function mockUserSession() {
  mockGetSession.mockResolvedValue({
    user: { id: "user-1", email: "user@test.com" },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id: "user-1",
    email: "user@test.com",
    nickname: "User",
    role: "user",
    banned: false,
  });
}

describe("canteen-admin-actions", () => {
  it("createCanteen requires admin", async () => {
    mockUserSession();
    await expect(createCanteen({ name: "Union" })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("createCanteen inserts for admin", async () => {
    mockAdminSession();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "c1",
        name: "Union",
        location: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDbInsert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) });

    const row = await createCanteen({ name: "Union" });
    expect(row.name).toBe("Union");
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("createCanteen uses mock store when CANTEEN_MOCK_DATA is true", async () => {
    const prev = process.env.CANTEEN_MOCK_DATA;
    process.env.CANTEEN_MOCK_DATA = "true";
    try {
      const { resetCanteenMockState } = await import("@/lib/canteen-mock");
      resetCanteenMockState();
      mockAdminSession();

      const row = await createCanteen({ name: "Mock 食堂", location: "A" });
      expect(row.name).toBe("Mock 食堂");
      expect(mockDbInsert).not.toHaveBeenCalled();
    } finally {
      process.env.CANTEEN_MOCK_DATA = prev;
      const { resetCanteenMockState } = await import("@/lib/canteen-mock");
      resetCanteenMockState();
    }
  });
});

describe("getAdminUserForApi", () => {
  it("returns null for non-admin", async () => {
    mockUserSession();
    const user = await getAdminUserForApi();
    expect(user).toBeNull();
  });

  it("returns admin user", async () => {
    mockAdminSession();
    const user = await getAdminUserForApi();
    expect(user?.role).toBe("admin");
  });
});
