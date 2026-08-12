import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminMock, promoteMock, revalidateTagMock } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  promoteMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));
vi.mock("@/lib/auth-guard", () => ({ getAdminUserForApi: adminMock }));
vi.mock("@/lib/campus-transport/model-experiment-store", () => ({
  promoteModelExperiment: promoteMock,
}));

import { POST } from "@/app/api/admin/campus-bus/model-experiments/[revisionId]/promote/route";

const context = {
  params: Promise.resolve({ revisionId: "revision-1" }),
};

describe("POST campus bus experiment promotion", () => {
  beforeEach(() => {
    adminMock.mockReset();
    promoteMock.mockReset();
    revalidateTagMock.mockReset();
    adminMock.mockResolvedValue({ id: "admin-1", role: "admin" });
    promoteMock.mockResolvedValue({ id: "revision-1" });
  });

  it("rejects non-admin callers", async () => {
    adminMock.mockResolvedValueOnce(null);
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("promotes a validated experiment and expires passenger cache", async () => {
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(promoteMock).toHaveBeenCalledWith("revision-1");
    expect(revalidateTagMock).toHaveBeenCalledWith("campus-bus-model", {
      expire: 0,
    });
  });

  it("rejects stale experiment promotion", async () => {
    promoteMock.mockRejectedValueOnce(new Error("MODEL_EXPERIMENT_STALE"));
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(409);
  });

  it("rejects an experiment that does not beat the current champion", async () => {
    promoteMock.mockRejectedValueOnce(
      new Error("MODEL_EXPERIMENT_NOT_BETTER_THAN_CHAMPION"),
    );
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(409);
  });
});
