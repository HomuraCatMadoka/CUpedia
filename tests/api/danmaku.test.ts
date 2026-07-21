import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetDanmakuAuthorForApi,
  mockInsert,
  mockList,
  mockRevalidate,
  mockAssertContributorComplete,
} = vi.hoisted(() => ({
  mockGetDanmakuAuthorForApi: vi.fn(),
  mockInsert: vi.fn(),
  mockList: vi.fn(),
  mockRevalidate: vi.fn(),
  mockAssertContributorComplete: vi.fn(async (user) => user),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidate(...args),
}));

vi.mock("@/lib/auth-guard", () => ({
  getDanmakuAuthorForApi: () => mockGetDanmakuAuthorForApi(),
}));

vi.mock("@/lib/contributor-account", () => ({
  assertContributorComplete: (user: unknown) =>
    mockAssertContributorComplete(user),
}));

vi.mock("@/lib/danmaku-mutations", () => ({
  insertDanmakuForUser: (...args: unknown[]) => mockInsert(...args),
}));

vi.mock("@/lib/danmaku-queries", () => ({
  listCurrentMonthDanmaku: () => mockList(),
}));

import { GET, POST } from "@/app/api/danmaku/route";

describe("/api/danmaku", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
  });

  it("GET returns current month messages", async () => {
    mockList.mockResolvedValue([
      {
        id: "d1",
        userId: "u1",
        content: "你好",
        month: "2026-07",
        authorNickname: "Alice",
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("你好");
    expect(body.messages[0]).not.toHaveProperty("userId");
    expect(body.messages[0]).not.toHaveProperty("authorNickname");
  });

  it("POST rejects anonymous with 401", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/danmaku", {
      method: "POST",
      body: JSON.stringify({ content: "hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("POST rejects banned user with 403", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Bob",
      banned: true,
    });
    const req = new NextRequest("http://localhost/api/danmaku", {
      method: "POST",
      body: JSON.stringify({ content: "hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "USER_BANNED" });
  });

  it("POST asks an incomplete account to finish setup without inserting", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "",
      banned: false,
    });
    mockAssertContributorComplete.mockRejectedValueOnce({
      code: "ACCOUNT_SETUP_REQUIRED",
      needs: { nickname: true, password: true },
    });
    const req = new NextRequest("http://localhost/api/danmaku", {
      method: "POST",
      body: JSON.stringify({ content: "hi" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "ACCOUNT_SETUP_REQUIRED",
      needs: { nickname: true, password: true },
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("POST creates danmaku for logged-in user", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Alice",
      banned: false,
    });
    mockInsert.mockResolvedValue({
      id: "d1",
      userId: "u1",
      content: "加油",
      month: "2026-07",
      authorNickname: "Alice",
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
    const req = new NextRequest("http://localhost/api/danmaku", {
      method: "POST",
      body: JSON.stringify({ content: "加油" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      { id: "u1", nickname: "Alice" },
      "加油",
    );
  });

  it("does not expose unexpected database errors", async () => {
    mockGetDanmakuAuthorForApi.mockResolvedValue({
      id: "u1",
      nickname: "Alice",
      banned: false,
    });
    mockInsert.mockRejectedValue(new Error("connection terminated"));
    const req = new NextRequest("http://localhost/api/danmaku", {
      method: "POST",
      body: JSON.stringify({ content: "hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "DANMAKU_FAILED" });
  });
});
