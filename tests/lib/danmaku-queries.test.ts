import { describe, it, expect, vi, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { canteenDanmakuMessages } from "@/db/schema";
import { currentMonthHkt } from "@/lib/hkt-datetime";

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

import {
  adminListCurrentMonthDanmaku,
  listCurrentMonthCanteenDanmaku,
  listCurrentMonthDanmaku,
} from "@/lib/danmaku-queries";

describe("danmaku-queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCurrentMonthDanmaku filters by HKT month", async () => {
    const july = new Date("2026-07-15T12:00:00Z");
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: "dm-1",
          userId: "u1",
          content: "七月弹幕",
          month: "2026-07",
          createdAt: july,
          authorNickname: "Alice",
        },
      ]),
    };
    mockDbSelect.mockReturnValue(chain);

    const rows = await listCurrentMonthDanmaku(july);
    expect(rows).toHaveLength(1);
    expect(rows[0].month).toBe("2026-07");
    expect(rows[0]).not.toHaveProperty("userId");
    expect(rows[0]).not.toHaveProperty("authorNickname");
    expect(chain.where).toHaveBeenCalled();
  });

  it("listCurrentMonthCanteenDanmaku filters by canteen and month", async () => {
    const july = new Date("2026-07-15T12:00:00Z");
    const month = currentMonthHkt(july);
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: "cdm-1",
          userId: "u1",
          content: "食堂弹幕",
          month,
          createdAt: july,
          authorNickname: "Bob",
        },
      ]),
    };
    mockDbSelect.mockReturnValue(chain);

    const rows = await listCurrentMonthCanteenDanmaku("canteen-1", july);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("食堂弹幕");
    expect(rows[0]).not.toHaveProperty("userId");
    expect(rows[0]).not.toHaveProperty("authorNickname");
    expect(chain.where).toHaveBeenCalledWith(
      and(
        eq(canteenDanmakuMessages.canteenId, "canteen-1"),
        eq(canteenDanmakuMessages.month, month),
      ),
    );
  });

  it("adminListCurrentMonthDanmaku includes hub and canteen stores", async () => {
    const createdAt = new Date("2026-07-15T12:00:00Z");
    const hubChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: "dm-1",
          userId: "u1",
          content: "总览弹幕",
          month: "2026-07",
          createdAt,
          authorNickname: "Alice",
          scope: "hub",
          canteenId: null,
          canteenName: null,
        },
      ]),
    };
    const canteenChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: "cdm-1",
          userId: "u2",
          content: "食堂弹幕",
          month: "2026-07",
          createdAt,
          authorNickname: "Bob",
          scope: "canteen",
          canteenId: "00000000-0000-4000-a000-000000000001",
          canteenName: "演示食堂",
        },
      ]),
    };
    mockDbSelect
      .mockReturnValueOnce(hubChain)
      .mockReturnValueOnce(canteenChain);

    const rows = await adminListCurrentMonthDanmaku();

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dm-1", scope: "hub" }),
        expect.objectContaining({ id: "cdm-1", scope: "canteen" }),
      ]),
    );
  });
});
