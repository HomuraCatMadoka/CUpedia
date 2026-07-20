import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const {
  dbQueue,
  dbChain,
  dbTransaction,
  mockRequireAdmin,
  mockRevalidatePath,
} = vi.hoisted(() => {
  const queue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "where",
    "limit",
    "orderBy",
    "values",
    "set",
    "returning",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(queue.length ? queue.shift() : []).then(resolve);
  return {
    dbQueue: queue,
    dbChain: chain,
    dbTransaction: vi.fn(),
    mockRequireAdmin: vi.fn(),
    mockRevalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => dbChain,
    transaction: (callback: (tx: unknown) => unknown) =>
      dbTransaction(callback),
  },
}));

import {
  previewAchievementCatalog,
  publishAchievementCatalog,
} from "@/lib/achievement-catalog-actions";

const tx = {
  execute: vi.fn(),
  select: () => dbChain,
  update: () => dbChain,
  insert: () => dbChain,
};

const rawCatalog = JSON.stringify({
  version: 1,
  sourceLabel: "approved review",
  programmes: [
    {
      programmeKey: "math-programme",
      badgeCode: "MATH",
      faculty: "science",
      tiers: [
        {
          tier: "bronze",
          displayName: "数学铜标",
          subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
        },
      ],
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.length = 0;
  mockRequireAdmin.mockResolvedValue({
    id: "00000000-0000-4000-a000-000000000001",
  });
  dbTransaction.mockImplementation(async (callback) => callback(tx));
});

describe("achievement catalog administration", () => {
  it("requires an administrator before previewing", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(previewAchievementCatalog(rawCatalog)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(dbChain.from).not.toHaveBeenCalled();
  });

  it("previews a valid catalog without opening a write transaction", async () => {
    dbQueue.push([]);

    await expect(previewAchievementCatalog(rawCatalog)).resolves.toMatchObject({
      version: 1,
      programmeCount: 1,
      ruleCount: 1,
      enabledProgrammeCount: 1,
    });
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("publishes the entire catalog in one transaction", async () => {
    dbQueue.push([], [], [], [], [{ id: "catalog-1" }], []);

    await expect(publishAchievementCatalog(rawCatalog)).resolves.toEqual({
      id: "catalog-1",
      version: 1,
    });

    const values = dbChain.values as Mock;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        status: "active",
        programmeCount: 1,
      }),
    );
    expect(values).toHaveBeenLastCalledWith([
      expect.objectContaining({
        catalogId: "catalog-1",
        programmeKey: "math-programme",
        ruleKey: "math-programme-bronze",
        enabled: true,
      }),
    ]);
    expect(dbTransaction).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/courses/achievements");
  });

  it("does not publish or revalidate when the transaction fails", async () => {
    dbTransaction.mockRejectedValueOnce(new Error("insert failed"));

    await expect(publishAchievementCatalog(rawCatalog)).rejects.toThrow(
      "insert failed",
    );
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a catalog version that is not newer", async () => {
    dbQueue.push([{ version: 2 }]);

    await expect(previewAchievementCatalog(rawCatalog)).rejects.toThrow(
      "目录版本须高于现有 v2",
    );
  });
});
