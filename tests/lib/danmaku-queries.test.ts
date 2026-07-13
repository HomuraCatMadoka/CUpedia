import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

import { listCurrentMonthDanmaku } from "@/lib/danmaku-queries";

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
    expect(chain.where).toHaveBeenCalled();
  });
});
