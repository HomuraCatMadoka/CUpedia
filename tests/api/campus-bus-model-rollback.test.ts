import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminMock, revalidateTagMock, rollbackMock } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  rollbackMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));
vi.mock("@/lib/auth-guard", () => ({ getAdminUserForApi: adminMock }));
vi.mock("@/lib/campus-transport/model-experiment-store", () => ({
  rollbackCampusBusModel: rollbackMock,
}));

import { POST } from "@/app/api/admin/campus-bus/model-revisions/[revisionId]/rollback/route";

const context = { params: Promise.resolve({ revisionId: "revision-1" }) };

describe("POST campus bus model rollback", () => {
  beforeEach(() => {
    adminMock.mockReset();
    revalidateTagMock.mockReset();
    rollbackMock.mockReset();
    adminMock.mockResolvedValue({ id: "admin-1", role: "admin" });
    rollbackMock.mockResolvedValue({ id: "revision-1" });
  });

  it("requires an admin", async () => {
    adminMock.mockResolvedValueOnce(null);
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(rollbackMock).not.toHaveBeenCalled();
  });

  it("restores a retired model and expires passenger cache", async () => {
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(rollbackMock).toHaveBeenCalledWith("revision-1");
    expect(revalidateTagMock).toHaveBeenCalledWith("campus-bus-model", {
      expire: 0,
    });
  });

  it("rejects a revision that is not retired", async () => {
    rollbackMock.mockRejectedValueOnce(
      new Error("MODEL_ROLLBACK_TARGET_NOT_FOUND"),
    );
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
  });
});
