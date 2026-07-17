import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetDanmakuAuthorForApi,
  mockInsert,
  mockList,
  mockRevalidate,
} = vi.hoisted(() => ({
  mockGetDanmakuAuthorForApi: vi.fn(),
  mockInsert: vi.fn(),
  mockList: vi.fn(),
  mockRevalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidate(...args),
}));

vi.mock("@/lib/auth-guard", () => ({
  getDanmakuAuthorForApi: () => mockGetDanmakuAuthorForApi(),
}));

vi.mock("@/lib/danmaku-mutations", () => ({
  insertCanteenDanmakuForUser: (...args: unknown[]) => mockInsert(...args),
}));

vi.mock("@/lib/danmaku-queries", () => ({
  listCurrentMonthCanteenDanmaku: (...args: unknown[]) => mockList(...args),
}));

import { GET, POST } from "@/app/api/canteen/[id]/danmaku/route";

const params = Promise.resolve({ id: "canteen-1" });

describe("/api/canteen/[id]/danmaku", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
  });

  it("GET returns current month messages for that canteen", async () => {
    mockList.mockResolvedValue([
      {
        id: "d1",
        userId: "u1",
        content: "推荐鱼香肉丝",
        month: "2026-07",
        authorNickname: "Alice",
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);
    const req = new NextRequest(
      "http://localhost/api/canteen/canteen-1/danmaku",
    );
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("canteen-1");
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("推荐鱼香肉丝");
  });

  it("POST rejects anonymous with 401", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue(null);
    const req = new NextRequest(
      "http://localhost/api/canteen/canteen-1/danmaku",
      {
        method: "POST",
        body: JSON.stringify({ content: "hi" }),
      },
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("POST creates canteen-scoped danmaku", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Alice",
      banned: false,
    });
    mockInsert.mockResolvedValue({
      id: "d1",
      userId: "u1",
      content: "好吃",
      month: "2026-07",
      authorNickname: "Alice",
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
    const req = new NextRequest(
      "http://localhost/api/canteen/canteen-1/danmaku",
      {
        method: "POST",
        body: JSON.stringify({ content: "好吃" }),
      },
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      { id: "u1", nickname: "Alice" },
      "canteen-1",
      "好吃",
    );
    expect(mockRevalidate).toHaveBeenCalledWith("/canteen/canteen-1");
  });

  it("POST maps CANTEEN_NOT_FOUND to 404", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Alice",
      banned: false,
    });
    mockInsert.mockRejectedValue(new Error("CANTEEN_NOT_FOUND"));
    const req = new NextRequest(
      "http://localhost/api/canteen/canteen-1/danmaku",
      {
        method: "POST",
        body: JSON.stringify({ content: "hi" }),
      },
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "CANTEEN_NOT_FOUND" });
  });
});
