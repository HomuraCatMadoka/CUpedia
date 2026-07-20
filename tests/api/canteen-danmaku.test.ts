import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetDanmakuAuthorForApi, mockInsert, mockList, mockRevalidate } =
  vi.hoisted(() => ({
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

const CANTEEN_ID = "00000000-0000-4000-a000-000000000001";
const params = Promise.resolve({ id: CANTEEN_ID });

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
        content: "演示菜品",
        month: "2026-07",
        authorNickname: "Alice",
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);
    const req = new NextRequest(
      `http://localhost/api/canteen/${CANTEEN_ID}/danmaku`,
    );
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(CANTEEN_ID);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("演示菜品");
    expect(body.messages[0]).not.toHaveProperty("userId");
    expect(body.messages[0]).not.toHaveProperty("authorNickname");
  });

  it("POST rejects anonymous with 401", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue(null);
    const req = new NextRequest(
      `http://localhost/api/canteen/${CANTEEN_ID}/danmaku`,
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
      `http://localhost/api/canteen/${CANTEEN_ID}/danmaku`,
      {
        method: "POST",
        body: JSON.stringify({ content: "好吃" }),
      },
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      { id: "u1", nickname: "Alice" },
      CANTEEN_ID,
      "好吃",
    );
    expect(mockRevalidate).toHaveBeenCalledWith(`/canteen/${CANTEEN_ID}`);
  });

  it("POST rejects non-object JSON body with 400", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Alice",
      banned: false,
    });
    const req = new NextRequest(
      `http://localhost/api/canteen/${CANTEEN_ID}/danmaku`,
      {
        method: "POST",
        body: JSON.stringify(["not", "an", "object"]),
      },
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_JSON" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("POST maps CANTEEN_NOT_FOUND to 404", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Alice",
      banned: false,
    });
    mockInsert.mockRejectedValue(new Error("CANTEEN_NOT_FOUND"));
    const req = new NextRequest(
      `http://localhost/api/canteen/${CANTEEN_ID}/danmaku`,
      {
        method: "POST",
        body: JSON.stringify({ content: "hi" }),
      },
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "CANTEEN_NOT_FOUND" });
  });

  it("rejects malformed canteen ids before querying", async () => {
    const invalidParams = Promise.resolve({ id: "not-a-uuid" });
    const req = new NextRequest(
      "http://localhost/api/canteen/not-a-uuid/danmaku",
    );
    const res = await GET(req, { params: invalidParams });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_CANTEEN_ID" });
    expect(mockList).not.toHaveBeenCalled();
  });

  it("does not expose unexpected database errors", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Alice",
      banned: false,
    });
    mockInsert.mockRejectedValue(
      new Error('relation "canteen_danmaku_messages" does not exist'),
    );
    const req = new NextRequest(
      `http://localhost/api/canteen/${CANTEEN_ID}/danmaku`,
      {
        method: "POST",
        body: JSON.stringify({ content: "hi" }),
      },
    );
    const res = await POST(req, { params });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "DANMAKU_FAILED" });
  });
});
