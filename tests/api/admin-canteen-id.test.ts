import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetAdminUserForApi,
  mockUpdateCanteen,
  mockGetCanteenById,
  mockDeleteCanteen,
} = vi.hoisted(() => ({
  mockGetAdminUserForApi: vi.fn(),
  mockUpdateCanteen: vi.fn(),
  mockGetCanteenById: vi.fn(),
  mockDeleteCanteen: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getAdminUserForApi: () => mockGetAdminUserForApi(),
}));

vi.mock("@/lib/canteen-actions", () => ({
  getCanteenById: (...args: unknown[]) => mockGetCanteenById(...args),
}));

vi.mock("@/lib/canteen-admin-actions", () => ({
  updateCanteen: (...args: unknown[]) => mockUpdateCanteen(...args),
  deleteCanteen: (...args: unknown[]) => mockDeleteCanteen(...args),
}));

import { PATCH } from "@/app/api/admin/canteens/[id]/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminUserForApi.mockResolvedValue({ id: "admin-1", role: "admin" });
});

describe("PATCH /api/admin/canteens/[id]", () => {
  it("returns 400 for null body", async () => {
    const req = new NextRequest("http://localhost/api/admin/canteens/c1", {
      method: "PATCH",
      body: "null",
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
    expect(mockUpdateCanteen).not.toHaveBeenCalled();
  });

  it("returns 400 for array body", async () => {
    const req = new NextRequest("http://localhost/api/admin/canteens/c1", {
      method: "PATCH",
      body: JSON.stringify([{ name: "x" }]),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
    expect(mockUpdateCanteen).not.toHaveBeenCalled();
  });

  it("passes only allowlisted fields to updateCanteen", async () => {
    mockUpdateCanteen.mockResolvedValue({
      id: "c1",
      name: "Union",
      location: null,
      announcement: "外带加 $1",
    });
    const req = new NextRequest("http://localhost/api/admin/canteens/c1", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Union",
        announcement: "外带加 $1",
        unexpected: "nope",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect(mockUpdateCanteen).toHaveBeenCalledWith("c1", {
      name: "Union",
      location: undefined,
      announcement: "外带加 $1",
    });
  });
});
