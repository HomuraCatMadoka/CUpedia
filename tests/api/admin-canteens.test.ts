import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAdminUserForApi, mockGetCanteens, mockCreateCanteen } =
  vi.hoisted(() => ({
    mockGetAdminUserForApi: vi.fn(),
    mockGetCanteens: vi.fn(),
    mockCreateCanteen: vi.fn(),
  }));

vi.mock("@/lib/auth-guard", () => ({
  getAdminUserForApi: () => mockGetAdminUserForApi(),
}));

vi.mock("@/lib/canteen-actions", () => ({
  getCanteens: (...args: unknown[]) => mockGetCanteens(...args),
}));

vi.mock("@/lib/canteen-admin-actions", () => ({
  createCanteen: (...args: unknown[]) => mockCreateCanteen(...args),
}));

import { GET, POST } from "@/app/api/admin/canteens/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin /api/admin/canteens", () => {
  it("GET returns 403 when not admin", async () => {
    mockGetAdminUserForApi.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET returns canteens for admin", async () => {
    mockGetAdminUserForApi.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockGetCanteens.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("POST returns 403 when not admin", async () => {
    mockGetAdminUserForApi.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/admin/canteens", {
      method: "POST",
      body: JSON.stringify({ name: "Union" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("POST returns 400 for non-object body", async () => {
    mockGetAdminUserForApi.mockResolvedValue({ id: "admin-1", role: "admin" });

    const req = new NextRequest("http://localhost/api/admin/canteens", {
      method: "POST",
      body: "null",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockCreateCanteen).not.toHaveBeenCalled();
  });
});
