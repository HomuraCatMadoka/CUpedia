import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  govern: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
  requestClientIp: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserStateForApi: mocks.getViewer,
}));
vi.mock("@/lib/campus-map/publish", () => ({
  governCampusMapFacts: mocks.govern,
}));
vi.mock("@/lib/campus-map/request-client-ip", () => ({
  requestClientIp: mocks.requestClientIp,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import {
  restoreCampusMapPlace,
  retireCampusMapPlace,
  runCampusMapPlaceLifecycleAction,
  type CampusMapPlaceLifecycleInput,
} from "@/lib/campus-map/place-lifecycle-actions";

const input: CampusMapPlaceLifecycleInput = {
  placeId: "10000000-0000-4000-8000-000000000001",
  baseRevisionId: "20000000-0000-4000-8000-000000000001",
  reason: "现场确认设施已经永久关闭",
  idempotencyKey: "30000000-0000-4000-8000-000000000001",
};

describe("Campus Map Place lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getViewer.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      banned: false,
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.requestClientIp.mockReturnValue("203.0.113.8");
  });

  it("submits only retirement intent to the trusted governance seam", async () => {
    mocks.govern.mockResolvedValue({
      status: "forbidden",
      code: "admin-required",
    });

    await expect(
      retireCampusMapPlace({
        ...input,
        // Simulates an untyped client adding the old field at runtime.
        sourceAccessedOn: "1970-01-01",
      } as CampusMapPlaceLifecycleInput),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });
    expect(mocks.govern).toHaveBeenCalledWith(
      {
        kind: "retire",
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        client: { name: "campus-map-place-lifecycle", version: "1" },
        placeId: input.placeId,
        baseRevisionId: input.baseRevisionId,
      },
      { actorId: "admin-1", clientIp: "203.0.113.8" },
    );
    expect(mocks.govern.mock.calls[0][0]).not.toHaveProperty(
      "sourceAccessedOn",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("submits restoration intent without reading or rebuilding a revision", async () => {
    mocks.govern.mockResolvedValue({
      status: "validation-failed",
      errors: [
        {
          code: "lifecycle-base-revision-unavailable",
          anchor: { placeId: input.placeId, field: "baseRevisionId" },
        },
      ],
      warnings: [],
      suggestions: [],
    });

    await expect(restoreCampusMapPlace(input)).resolves.toMatchObject({
      status: "validation-failed",
    });
    expect(mocks.govern.mock.calls[0][0]).toEqual(
      expect.objectContaining({ kind: "restore", placeId: input.placeId }),
    );
  });

  it("authorizes before forwarding a client-selected revision", async () => {
    mocks.getViewer.mockResolvedValueOnce(null);
    await expect(restoreCampusMapPlace(input)).resolves.toEqual({
      status: "authentication-required",
      code: "authentication-required",
    });
    expect(mocks.govern).not.toHaveBeenCalled();

    mocks.getViewer.mockResolvedValueOnce({
      id: "user-1",
      role: "user",
      banned: false,
    });
    await expect(restoreCampusMapPlace(input)).resolves.toEqual({
      status: "forbidden",
      code: "admin-required",
    });
    expect(mocks.govern).not.toHaveBeenCalled();
  });

  it("distinguishes a banned caller from an anonymous caller", async () => {
    mocks.getViewer.mockResolvedValueOnce({
      id: "banned-1",
      role: "admin",
      banned: true,
    });

    await expect(retireCampusMapPlace(input)).resolves.toEqual({
      status: "forbidden",
      code: "actor-banned",
    });
    expect(mocks.govern).not.toHaveBeenCalled();
  });

  it("rejects malformed revision identities before forwarding", async () => {
    await expect(
      restoreCampusMapPlace({
        ...input,
        placeId: "not-a-place-id",
        baseRevisionId: "not-a-revision-id",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "invalid-place-id",
          anchor: { changeIndex: 0, field: "placeId" },
        },
        {
          code: "invalid-base-revision-id",
          anchor: { changeIndex: 0, field: "baseRevisionId" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
    expect(mocks.govern).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown client-supplied operation", async () => {
    await expect(
      runCampusMapPlaceLifecycleAction({
        ...input,
        operation: "unexpected" as "retire",
      }),
    ).resolves.toEqual({ status: "failed", code: "operation-not-allowed" });
    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.govern).not.toHaveBeenCalled();
  });

  it("projects failures for the UI and revalidates successful lifecycle pages", async () => {
    mocks.govern.mockResolvedValueOnce({
      status: "forbidden",
      code: "admin-required",
    });
    await expect(
      runCampusMapPlaceLifecycleAction({ ...input, operation: "retire" }),
    ).resolves.toEqual({ status: "failed", code: "admin-required" });

    mocks.govern.mockResolvedValueOnce({
      status: "published",
      changesetId: "60000000-0000-4000-8000-000000000001",
      changes: [
        {
          placeId: input.placeId,
          revisionId: "70000000-0000-4000-8000-000000000001",
        },
      ],
      warnings: [],
      suggestions: [],
    });
    await expect(restoreCampusMapPlace(input)).resolves.toMatchObject({
      status: "published",
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/campus-map"],
      [`/campus-map/places/${input.placeId}`],
      [`/campus-map/places/${input.placeId}/history`],
    ]);
  });
});
