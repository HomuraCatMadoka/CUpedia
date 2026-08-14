import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockAppendShameVote,
  mockRequireCliAuth,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockAppendShameVote: vi.fn(),
  mockRequireCliAuth: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}));

vi.mock("@/lib/canteen-shame-actions", () => ({
  appendShameVote: (...args: unknown[]) => mockAppendShameVote(...args),
}));

vi.mock("@/lib/cli-api/auth", () => ({
  requireCliAuth: (...args: unknown[]) => mockRequireCliAuth(...args),
}));

vi.mock("@/lib/cli-api/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  DEFAULT_WRITE_LIMIT: 30,
}));

import { POST } from "@/app/api/canteens/shit-vote/route";

const USER = { id: "user-1", email: "u@cuhk.edu.hk", nickname: "N", role: "user", banned: false };
const AUTH_OK = { user: USER, response: null };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/canteens/shit-vote", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCliAuth.mockResolvedValue(AUTH_OK);
  mockCheckRateLimit.mockReturnValue({
    allowed: true,
    remaining: 29,
    retryAfterMs: 0,
  });
  mockAppendShameVote.mockResolvedValue({
    ok: true,
    canteenId: "c1",
    voteDate: "2026-08-07",
  });
});

describe("POST /api/canteens/shit-vote", () => {
  it("requires CLI auth (401 when anonymous)", async () => {
    mockRequireCliAuth.mockResolvedValue({
      user: null,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await POST(makeRequest({ canteenId: "c1" }));
    expect(res.status).toBe(401);
    expect(mockAppendShameVote).not.toHaveBeenCalled();
  });

  it("appends a vote on valid input", async () => {
    const res = await POST(makeRequest({ canteenId: "c1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      canteenId: "c1",
      voteDate: "2026-08-07",
    });
    expect(mockAppendShameVote).toHaveBeenCalledWith("c1");
  });

  it("trims whitespace around canteenId", async () => {
    await POST(makeRequest({ canteenId: "  c1  " }));
    expect(mockAppendShameVote).toHaveBeenCalledWith("c1");
  });

  it("rejects missing/blank/non-string canteenId", async () => {
    for (const body of [
      {},
      { canteenId: "" },
      { canteenId: "   " },
      { canteenId: 42 },
    ]) {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
    }
    expect(mockAppendShameVote).not.toHaveBeenCalled();
  });

  it("rejects non-object / non-JSON bodies", async () => {
    const notJson = new Request("http://localhost/api/canteens/shit-vote", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(notJson);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_JSON" });
  });

  it("maps appendShameVote error codes to HTTP statuses", async () => {
    const cases: Array<[string, number]> = [
      ["RATE_LIMIT_EXCEEDED", 429],
      ["DAILY_LIMIT_EXCEEDED", 429],
      ["USER_BANNED", 403],
      ["SHAME_VOTING_CLOSED", 403],
      ["ANON_SESSION_REQUIRED", 403],
      ["CANTEEN_NOT_FOUND", 404],
    ];
    for (const [code, status] of cases) {
      mockAppendShameVote.mockResolvedValueOnce({ ok: false, code });
      const res = await POST(makeRequest({ canteenId: "c1" }));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: code });
    }
  });

  it("returns 429 when the per-user write rate limit is hit", async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 42_000,
    });
    const res = await POST(makeRequest({ canteenId: "c1" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "RATE_LIMIT_EXCEEDED" });
    expect(mockAppendShameVote).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "canteen:shit-vote:user-1",
      30,
    );
  });
});
