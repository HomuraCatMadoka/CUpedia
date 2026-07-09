import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAdminUserForApi, mockStartMenuImportFromImage } = vi.hoisted(
  () => ({
    mockGetAdminUserForApi: vi.fn(),
    mockStartMenuImportFromImage: vi.fn(),
  }),
);

vi.mock("@/lib/auth-guard", () => ({
  getAdminUserForApi: () => mockGetAdminUserForApi(),
}));

vi.mock("@/lib/canteen-import-actions", () => ({
  startMenuImportFromImage: (...args: unknown[]) =>
    mockStartMenuImportFromImage(...args),
}));

import { POST } from "@/app/api/admin/canteens/[id]/menu-import/route";

describe("POST /api/admin/canteens/[id]/menu-import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin", async () => {
    mockGetAdminUserForApi.mockResolvedValue(null);
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "image/jpeg" }), "menu.jpg");
    const req = new NextRequest("http://localhost/api/admin/canteens/c1/menu-import", {
      method: "POST",
      body: form,
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when file missing", async () => {
    mockGetAdminUserForApi.mockResolvedValue({ id: "admin-1" });
    const req = new NextRequest("http://localhost/api/admin/canteens/c1/menu-import", {
      method: "POST",
      body: new FormData(),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
  });

  it("starts import for admin with file", async () => {
    mockGetAdminUserForApi.mockResolvedValue({ id: "admin-1" });
    mockStartMenuImportFromImage.mockResolvedValue({
      id: "draft-1",
      status: "ready",
      items: [],
    });
    const form = new FormData();
    form.append("file", new Blob(["img"], { type: "image/png" }), "menu.png");
    const req = new NextRequest("http://localhost/api/admin/canteens/c1/menu-import", {
      method: "POST",
      body: form,
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(201);
    expect(mockStartMenuImportFromImage).toHaveBeenCalled();
  });
});
