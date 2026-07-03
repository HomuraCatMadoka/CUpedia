import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockUpsertDishVote } = vi.hoisted(() => ({
  mockUpsertDishVote: vi.fn(),
}));

vi.mock("@/lib/canteen-vote-actions", () => ({
  upsertDishVote: (...args: unknown[]) => mockUpsertDishVote(...args),
}));

import { POST } from "@/app/api/canteens/menu-items/[itemId]/vote/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/canteens/menu-items/[itemId]/vote", () => {
  it("returns vote result on success", async () => {
    mockUpsertDishVote.mockResolvedValue({
      menuItemId: "item-1",
      vote: "like",
    });

    const req = new NextRequest(
      "http://localhost/api/canteens/menu-items/item-1/vote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: "like" }),
      },
    );

    const res = await POST(req, { params: Promise.resolve({ itemId: "item-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ menuItemId: "item-1", vote: "like" });
  });

  it("maps ANON_SESSION_REQUIRED to 403", async () => {
    mockUpsertDishVote.mockRejectedValue(new Error("ANON_SESSION_REQUIRED"));

    const req = new NextRequest(
      "http://localhost/api/canteens/menu-items/item-1/vote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: "like" }),
      },
    );

    const res = await POST(req, { params: Promise.resolve({ itemId: "item-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when vote field is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/canteens/menu-items/item-1/vote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    const res = await POST(req, { params: Promise.resolve({ itemId: "item-1" }) });
    expect(res.status).toBe(400);
    expect(mockUpsertDishVote).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid vote before calling action", async () => {
    const req = new NextRequest(
      "http://localhost/api/canteens/menu-items/item-1/vote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: "maybe" }),
      },
    );

    const res = await POST(req, { params: Promise.resolve({ itemId: "item-1" }) });
    expect(res.status).toBe(400);
    expect(mockUpsertDishVote).not.toHaveBeenCalled();
  });

  it("maps RATE_LIMIT_EXCEEDED to 429", async () => {
    mockUpsertDishVote.mockRejectedValue(new Error("RATE_LIMIT_EXCEEDED"));

    const req = new NextRequest(
      "http://localhost/api/canteens/menu-items/item-1/vote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: "dislike" }),
      },
    );

    const res = await POST(req, { params: Promise.resolve({ itemId: "item-1" }) });
    expect(res.status).toBe(429);
  });
});
