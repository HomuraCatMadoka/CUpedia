import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, requireAdmin, select, transaction } = vi.hoisted(() => ({
  execute: vi.fn(),
  requireAdmin: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAdmin }));
vi.mock("@/db", () => ({ db: { execute, select, transaction } }));

import { adminListCanteenMenuSourceHealth } from "@/lib/canteen-menu-sync-health";

const NOW = new Date("2026-08-14T04:00:00.000Z");

function queryChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.groupBy.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  Object.assign(chain, {
    then: (resolve: (value: unknown[]) => unknown) => resolve(result),
  });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin-1" });
  execute.mockResolvedValue({ rows: [] });
  transaction.mockImplementation(
    async (
      callback: (tx: {
        execute: typeof execute;
        select: typeof select;
      }) => unknown,
    ) => callback({ execute, select }),
  );
});

describe("adminListCanteenMenuSourceHealth", () => {
  it("authenticates before querying", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(adminListCanteenMenuSourceHealth(NOW)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(select).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("reads source and run facts from one read-only repeatable snapshot", async () => {
    select.mockReturnValueOnce(queryChain([]));

    await adminListCanteenMenuSourceHealth(NOW);

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("returns only bounded allowlisted health fields", async () => {
    const sourceRow = {
      id: "source-1",
      canteenId: "canteen-1",
      canteenName: "開心軒茶社",
      provider: "pinme",
      externalOwnerId: null,
      externalStoreId: "5203",
      enabled: true,
      legacyTakeoverAt: null,
      lastAttemptAt: NOW,
      lastSuccessAt: null,
      lastErrorCode: "UPSTREAM_HTTP_503 https://private.example/token",
      config: { token: "CANARY_SYNC_SECRET" },
      lastError: "https://private.example/CANARY_SYNC_SECRET",
      managedItemCount: 0,
      manualItemCount: 0,
    };
    const recentRunRows = [
      {
        id: "recent-run-0",
        menuSourceId: "source-1",
        status: "unchanged",
        itemCount: 10,
        createdCount: 0,
        updatedCount: 0,
        deactivatedCount: 0,
        errorCode: "UPSTREAM_HTTP_503 https://private.example/token",
        startedAt: NOW.toISOString(),
        completedAt: NOW.toISOString(),
        runNumber: 1,
        hasOverdueRun: true,
      },
    ];
    select.mockReturnValueOnce(queryChain([sourceRow]));
    execute.mockResolvedValue({ rows: recentRunRows });

    const [result] = await adminListCanteenMenuSourceHealth(NOW);

    expect(result.lastErrorCode).toBe("UPSTREAM_HTTP_503");
    expect(result.recentRuns[0].errorCode).toBe("UPSTREAM_HTTP_503");
    expect(result.recentRuns[0].startedAt).toBeInstanceOf(Date);
    expect(result.recentRuns[0].completedAt).toBeInstanceOf(Date);
    expect(result.hasOverdueRun).toBe(true);
    expect(result).not.toHaveProperty("config");
    expect(result).not.toHaveProperty("lastError");
    expect(result).not.toHaveProperty("risks");
    expect(result).not.toHaveProperty("successOverdue");
    expect(result.recentRuns[0]).not.toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("private.example");
    expect(JSON.stringify(result)).not.toContain("CANARY_SYNC_SECRET");
  });
});
