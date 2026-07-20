import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAssertRateLimit,
  mockAssertCanteenRateLimit,
  mockDbInsert,
  mockDbTransaction,
  mockFindCanteen,
  mockTxExecute,
} = vi.hoisted(() => ({
  mockAssertRateLimit: vi.fn(),
  mockAssertCanteenRateLimit: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockFindCanteen: vi.fn(),
  mockTxExecute: vi.fn(),
}));

vi.mock("@/lib/danmaku-rate-limit", () => ({
  assertDanmakuRateLimitInTransaction: (...args: unknown[]) =>
    mockAssertRateLimit(...args),
  assertCanteenDanmakuRateLimitInTransaction: (...args: unknown[]) =>
    mockAssertCanteenRateLimit(...args),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) => {
      mockDbTransaction();
      return callback({
        execute: (...args: unknown[]) => mockTxExecute(...args),
        insert: (...args: unknown[]) => mockDbInsert(...args),
      });
    },
    query: {
      canteens: {
        findFirst: (...args: unknown[]) => mockFindCanteen(...args),
      },
    },
  },
}));

import { canteenDanmakuMessages } from "@/db/schema";
import {
  insertCanteenDanmakuForUser,
  insertDanmakuForUser,
} from "@/lib/danmaku-mutations";

describe("danmaku-mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertRateLimit.mockResolvedValue(undefined);
    mockAssertCanteenRateLimit.mockResolvedValue(undefined);
    mockFindCanteen.mockResolvedValue({ id: "canteen-1" });
  });

  it("insertDanmakuForUser writes row after rate-limit check", async () => {
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

    const row = await insertDanmakuForUser(
      { id: "user-1", nickname: "Tester" },
      "期末加油",
    );
    expect(row.content).toBe("期末加油");
    expect(mockDbTransaction).toHaveBeenCalledOnce();
    expect(mockAssertRateLimit).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ execute: expect.any(Function) }),
    );
  });

  it("propagates rate limit errors", async () => {
    mockAssertRateLimit.mockRejectedValue(
      new Error("DANMAKU_RATE_LIMIT_EXCEEDED"),
    );
    await expect(
      insertDanmakuForUser({ id: "user-1", nickname: "T" }, "a"),
    ).rejects.toThrow("DANMAKU_RATE_LIMIT_EXCEEDED");
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("insertCanteenDanmakuForUser writes to canteen table after checks", async () => {
    const now = new Date();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "cdm-1",
        userId: "user-1",
        content: "好吃",
        month: "2026-07",
        createdAt: now,
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    mockDbInsert.mockReturnValue({ values });

    const row = await insertCanteenDanmakuForUser(
      { id: "user-1", nickname: "Tester" },
      "canteen-1",
      "好吃",
    );
    expect(row.content).toBe("好吃");
    expect(mockDbInsert).toHaveBeenCalledWith(canteenDanmakuMessages);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        canteenId: "canteen-1",
        userId: "user-1",
        content: "好吃",
      }),
    );
    expect(mockDbTransaction).toHaveBeenCalledOnce();
    expect(mockAssertCanteenRateLimit).toHaveBeenCalledWith(
      "user-1",
      "canteen-1",
      expect.objectContaining({ execute: expect.any(Function) }),
    );
  });

  it("insertCanteenDanmakuForUser rejects unknown canteen", async () => {
    mockFindCanteen.mockResolvedValue(undefined);
    await expect(
      insertCanteenDanmakuForUser(
        { id: "user-1", nickname: "T" },
        "missing",
        "hi",
      ),
    ).rejects.toThrow("CANTEEN_NOT_FOUND");
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
