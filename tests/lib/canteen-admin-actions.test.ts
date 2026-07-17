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
  unstable_cache: (fn: (id: string) => unknown) => fn,
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
    transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        insert: (...args: unknown[]) => mockDbInsert(...args),
        update: (...args: unknown[]) => mockDbUpdate(...args),
        delete: (...args: unknown[]) => mockDbDelete(...args),
        select: (...args: unknown[]) => mockDbSelect(...args),
      }),
  },
}));

import {
  createCanteen,
  createMenuItem,
  bulkImportMenuItemsFromJson,
  deleteCanteen,
  deleteMenuItem,
  updateCanteen,
  updateMenuItem,
} from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard";

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
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
        announcement: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning }),
    });

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

  it("updateCanteen updates for admin", async () => {
    mockAdminSession();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "c1",
        name: "Renamed",
        location: "B",
        announcement: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning }),
      }),
    });

    const row = await updateCanteen("c1", { name: "Renamed", location: "B" });
    expect(row.name).toBe("Renamed");
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("updateCanteen can set announcement", async () => {
    mockAdminSession();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "c1",
        name: "Union",
        location: null,
        announcement: "外带加 $1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning }),
      }),
    });

    const row = await updateCanteen("c1", { announcement: "外带加 $1" });
    expect(row.announcement).toBe("外带加 $1");
  });

  it("deleteCanteen removes row for admin", async () => {
    mockAdminSession();
    const returning = vi.fn().mockResolvedValue([{ id: "c1" }]);
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });

    await deleteCanteen("c1");
    expect(mockDbDelete).toHaveBeenCalled();
  });

  it("createMenuItem stores normalized price options for admin", async () => {
    mockAdminSession();
    mockDbQueryCanteens.findFirst.mockResolvedValue({ id: "c1" });
    const returning = vi.fn().mockResolvedValue([
      {
        id: "i1",
        canteenId: "c1",
        name: "饭",
        price: null,
        mealPeriod: "lunch",
        sortOrder: 0,
        svgKey: "default",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const priceReturning = vi.fn().mockResolvedValue([
      {
        id: "p1",
        menuItemId: "i1",
        label: "凍",
        amountMinor: 1300,
        currency: "HKD",
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDbInsert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ returning }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ returning: priceReturning }),
      });

    const row = await createMenuItem("c1", {
      name: "饭",
      mealPeriod: "lunch",
      pricing: {
        options: [{ label: "凍", amountMinor: 1300, currency: "HKD" }],
      },
    });
    expect(row.name).toBe("饭");
    expect(row.pricing?.options[0]).toMatchObject({
      id: "p1",
      label: "凍",
      amountMinor: 1300,
    });
  });

  it("updateMenuItem updates for admin", async () => {
    mockAdminSession();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "i1",
        canteenId: "c1",
        name: "新名",
        price: 12,
        mealPeriod: "dinner",
        sortOrder: 0,
        svgKey: "default",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning }),
      }),
    });

    const row = await updateMenuItem("c1", "i1", {
      name: "新名",
      mealPeriod: "dinner",
    });
    expect(row.name).toBe("新名");
    expect(row.mealPeriod).toBe("dinner");
  });

  it("deleteMenuItem removes row for admin", async () => {
    mockAdminSession();
    const returning = vi.fn().mockResolvedValue([{ id: "i1" }]);
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });

    await deleteMenuItem("c1", "i1");
    expect(mockDbDelete).toHaveBeenCalled();
  });

  it("deleteMenuItem does not delete item from another canteen", async () => {
    mockAdminSession();
    const returning = vi.fn().mockResolvedValue([]);
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });

    await expect(deleteMenuItem("c1", "i-other")).rejects.toThrow(
      "MENU_ITEM_NOT_FOUND",
    );
  });

  it("bulkImportMenuItemsFromJson imports rows in mock mode", async () => {
    const prev = process.env.CANTEEN_MOCK_DATA;
    process.env.CANTEEN_MOCK_DATA = "true";
    try {
      const { resetCanteenMockState, mockListMenuItems } =
        await import("@/lib/canteen-mock");
      resetCanteenMockState();
      mockAdminSession();

      const created = await bulkImportMenuItemsFromJson("mock-canteen-demo", [
        { name: "JSON导入A", price: 15, mealPeriod: "lunch" },
        { name: "JSON导入B", price: 20, mealPeriod: "dinner", sortOrder: 2 },
      ]);
      expect(created).toHaveLength(2);

      const menu = mockListMenuItems("mock-canteen-demo");
      expect(menu.some((item) => item.name === "JSON导入A")).toBe(true);
      expect(menu.some((item) => item.name === "JSON导入B")).toBe(true);
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
