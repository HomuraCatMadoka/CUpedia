import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAuth,
  mockTransaction,
  mockInsert,
  mockFindBuild,
  mockFindBuilds,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockTransaction: vi.fn(),
  mockInsert: vi.fn(),
  mockFindBuild: vi.fn(),
  mockFindBuilds: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/db", () => ({
  db: {
    transaction: mockTransaction,
    query: {
      builds: { findFirst: mockFindBuild, findMany: mockFindBuilds },
    },
  },
}));

import { listMyBuilds, loadBuild, saveBuild } from "@/lib/build-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "user-1" });
  mockTransaction.mockImplementation(async (callback) =>
    callback({ insert: mockInsert }),
  );
});

describe("loadBuild", () => {
  it("只加载当前用户自己的完整构筑", async () => {
    mockFindBuild.mockResolvedValue({
      id: "build-1",
      majorId: "major-1",
      name: "AI 路线",
      mode: "strict",
      items: [{ courseCode: "CSCI2100", term: 3 }],
    });

    await expect(loadBuild("build-1")).resolves.toEqual({
      id: "build-1",
      majorId: "major-1",
      name: "AI 路线",
      mode: "strict",
      items: [{ code: "CSCI2100", term: 3 }],
    });
    expect(mockFindBuild).toHaveBeenCalledOnce();
  });
});

describe("listMyBuilds", () => {
  it("列出当前用户的多个命名构筑", async () => {
    mockFindBuilds.mockResolvedValue([
      { id: "b2", name: "数据路线", majorId: "m1", mode: "free" },
      { id: "b1", name: "AI 路线", majorId: "m1", mode: "strict" },
    ]);

    await expect(listMyBuilds()).resolves.toEqual([
      { id: "b2", name: "数据路线", majorId: "m1", mode: "free" },
      { id: "b1", name: "AI 路线", majorId: "m1", mode: "strict" },
    ]);
    expect(mockFindBuilds).toHaveBeenCalledOnce();
  });
});

describe("saveBuild", () => {
  it("已登录用户保存命名构筑并保留严格模式学期", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "build-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert
      .mockReturnValueOnce({ values })
      .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });

    await expect(
      saveBuild({
        majorId: "major-1",
        name: "AI 路线",
        mode: "strict",
        items: [
          { code: "CSCI1130", term: 1 },
          { code: "CSCI2100", term: 3 },
        ],
      }),
    ).resolves.toBe("build-1");

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        majorId: "major-1",
        name: "AI 路线",
        mode: "strict",
      }),
    );
  });
});
