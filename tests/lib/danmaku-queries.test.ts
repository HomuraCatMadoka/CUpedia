import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { canteenDanmakuMessages } from "@/db/schema";

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

import {
  adminListDanmakuHistory,
  listCanteenDanmaku,
  listDanmaku,
} from "@/lib/danmaku-queries";
import { DANMAKU_FLY_MAX } from "@/lib/danmaku-types";

describe("danmaku-queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listDanmaku returns public history without month filter", async () => {
    const createdAt = new Date("2026-07-15T12:00:00Z");
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "dm-1",
          userId: "u1",
          content: "历史弹幕",
          month: "2026-07",
          createdAt,
          authorNickname: "Alice",
        },
      ]),
    };
    mockDbSelect.mockReturnValue(chain);

    const rows = await listDanmaku();
    expect(rows).toHaveLength(1);
    expect(rows[0].month).toBe("2026-07");
    expect(rows[0]).not.toHaveProperty("userId");
    expect(rows[0]).not.toHaveProperty("authorNickname");
    expect(chain.where).not.toHaveBeenCalled();
    expect(chain.orderBy).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(DANMAKU_FLY_MAX);
  });

  it("listCanteenDanmaku filters by canteen only", async () => {
    const createdAt = new Date("2026-07-15T12:00:00Z");
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "cdm-1",
          userId: "u1",
          content: "食堂弹幕",
          month: "2026-01",
          createdAt,
          authorNickname: "Bob",
        },
      ]),
    };
    mockDbSelect.mockReturnValue(chain);

    const rows = await listCanteenDanmaku("canteen-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("食堂弹幕");
    expect(rows[0]).not.toHaveProperty("userId");
    expect(rows[0]).not.toHaveProperty("authorNickname");
    expect(chain.where).toHaveBeenCalledWith(
      eq(canteenDanmakuMessages.canteenId, "canteen-1"),
    );
    expect(chain.limit).toHaveBeenCalledWith(DANMAKU_FLY_MAX);
  });

  it("adminListDanmakuHistory includes hub and canteen stores across months", async () => {
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
          month: "2026-01",
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

    const rows = await adminListDanmakuHistory();

    expect(hubChain.where).not.toHaveBeenCalled();
    expect(canteenChain.where).not.toHaveBeenCalled();
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dm-1", scope: "hub" }),
        expect.objectContaining({ id: "cdm-1", scope: "canteen" }),
      ]),
    );
  });
});
