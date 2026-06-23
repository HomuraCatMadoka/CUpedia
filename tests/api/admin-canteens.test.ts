import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdminApi, mockGetCanteens } = vi.hoisted(() => ({
  mockRequireAdminApi: vi.fn(),
  mockGetCanteens: vi.fn(),
}));

vi.mock("@/lib/admin-api", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

vi.mock("@/lib/canteen-actions", () => ({
  getCanteens: (...args: unknown[]) => mockGetCanteens(...args),
}));

import { GET, POST } from "@/app/api/admin/canteens/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin /api/admin/canteens", () => {
  it("GET returns 403 when not admin", async () => {
    mockRequireAdminApi.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET returns canteens for admin", async () => {
    mockRequireAdminApi.mockResolvedValue({
      user: { id: "admin-1" },
      response: null,
    });
    mockGetCanteens.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("POST returns 403 when not admin", async () => {
    mockRequireAdminApi.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const req = new NextRequest("http://localhost/api/admin/canteens", {
      method: "POST",
      body: JSON.stringify({ name: "Union" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
