import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  getRevision: vi.fn(),
  headers: vi.fn(),
  publish: vi.fn(),
  revalidatePath: vi.fn(),
  requestClientIp: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserForApi: mocks.getViewer,
}));
vi.mock("@/lib/campus-map/fact-store", () => ({
  getCampusMapPlaceRevision: mocks.getRevision,
}));
vi.mock("@/lib/campus-map/publish", () => ({
  publishCampusMapChangeset: mocks.publish,
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
} from "@/lib/campus-map/place-lifecycle-actions";

const input = {
  placeId: "10000000-0000-4000-8000-000000000001",
  baseRevisionId: "20000000-0000-4000-8000-000000000001",
  reason: "现场确认设施已经永久关闭",
  idempotencyKey: "30000000-0000-4000-8000-000000000001",
};

function publicRevision() {
  return {
    id: input.baseRevisionId,
    placeId: input.placeId,
    status: "retired",
    publishedAt: new Date("2026-08-30T23:30:00.000Z"),
    content: {
      visibility: "public",
      fact: {
        name: "科学馆饮水点",
        pinType: "water",
        capabilities: [],
        gender: "unknown",
        wheelchairAccess: "limited",
        audience: "cuhk-member",
        credentialRequirement: "campus-card",
        accessSchedule: { kind: "unknown" },
        reservationRequirement: "none",
        temporaryStatus: "normal",
        buildingId: "40000000-0000-4000-8000-000000000001",
        floorId: "50000000-0000-4000-8000-000000000001",
        locationKind: "floor",
        pointPrecision: null,
        longitude: null,
        latitude: null,
        coordinateCrs: null,
        observedAt: new Date("2026-08-29T00:00:00.000Z"),
        verifiedAt: null,
        provenance: [],
      },
    },
  };
}

describe("Campus Map Place lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getViewer.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.requestClientIp.mockReturnValue("203.0.113.8");
    mocks.getRevision.mockResolvedValue(publicRevision());
  });

  it("submits retirement intent only and leaves authorization to the publish seam", async () => {
    mocks.publish.mockResolvedValue({
      status: "forbidden",
      code: "admin-required",
    });

    await expect(retireCampusMapPlace(input)).resolves.toEqual({
      status: "forbidden",
      code: "admin-required",
    });
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "single",
        idempotencyKey: input.idempotencyKey,
        comment: input.reason,
        changes: [
          expect.objectContaining({
            operation: "retire",
            placeId: input.placeId,
            baseRevisionId: input.baseRevisionId,
            sources: [
              expect.objectContaining({
                kind: "other",
                ref: expect.stringMatching(
                  /^campus-map-admin-lifecycle:[0-9a-f]{64}$/,
                ),
                accessedOn: "2026-08-31",
                note: input.reason,
                sourceCoordinate: null,
              }),
            ],
          }),
        ],
      }),
      { actorId: "admin-1", clientIp: "203.0.113.8" },
    );
    const sourceRef = mocks.publish.mock.calls[0][0].changes[0].sources[0].ref;
    expect(sourceRef).not.toContain(input.idempotencyKey);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("authorizes before reading a client-selected restore revision", async () => {
    mocks.getViewer.mockResolvedValueOnce(null);
    await expect(restoreCampusMapPlace(input)).resolves.toEqual({
      status: "authentication-required",
      code: "authentication-required",
    });
    expect(mocks.getRevision).not.toHaveBeenCalled();

    mocks.getViewer.mockResolvedValueOnce({ id: "user-1", role: "user" });
    await expect(restoreCampusMapPlace(input)).resolves.toEqual({
      status: "forbidden",
      code: "admin-required",
    });
    expect(mocks.getRevision).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown client-supplied operation", async () => {
    await expect(
      runCampusMapPlaceLifecycleAction({
        ...input,
        operation: "unexpected" as "retire",
      }),
    ).resolves.toEqual({ status: "failed", code: "operation-not-allowed" });
    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.getRevision).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("projects publish authorization failures into the UI action result", async () => {
    mocks.publish.mockResolvedValue({
      status: "forbidden",
      code: "admin-required",
    });

    await expect(
      runCampusMapPlaceLifecycleAction({ ...input, operation: "retire" }),
    ).resolves.toEqual({ status: "failed", code: "admin-required" });
  });

  it("rebuilds restore facts from the public server revision and revalidates reads", async () => {
    mocks.publish.mockResolvedValue({
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
    const command = mocks.publish.mock.calls[0][0];
    expect(command.changes[0]).toMatchObject({
      operation: "restore",
      placeId: input.placeId,
      baseRevisionId: input.baseRevisionId,
      fact: {
        name: "科学馆饮水点",
        buildingId: "40000000-0000-4000-8000-000000000001",
        floorId: "50000000-0000-4000-8000-000000000001",
        wheelchairAccess: "limited",
        location: { kind: "floor" },
        observedAt: "2026-08-29T00:00:00.000Z",
      },
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/campus-map"],
      [`/campus-map/places/${input.placeId}`],
      [`/campus-map/places/${input.placeId}/history`],
    ]);
  });

  it("scopes the public lifecycle source identity to the authenticated actor", async () => {
    mocks.publish.mockResolvedValue({
      status: "forbidden",
      code: "admin-required",
    });

    await retireCampusMapPlace(input);
    const firstRef = mocks.publish.mock.calls[0][0].changes[0].sources[0].ref;
    mocks.getViewer.mockResolvedValueOnce({ id: "admin-2", role: "admin" });
    await retireCampusMapPlace(input);
    const secondRef = mocks.publish.mock.calls[1][0].changes[0].sources[0].ref;

    expect(secondRef).not.toBe(firstRef);
    expect(firstRef).not.toContain(input.idempotencyKey);
    expect(secondRef).not.toContain(input.idempotencyKey);
  });

  it("fails closed when a restore base is missing or hidden", async () => {
    mocks.getRevision.mockResolvedValue(null);

    await expect(restoreCampusMapPlace(input)).resolves.toEqual({
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
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
