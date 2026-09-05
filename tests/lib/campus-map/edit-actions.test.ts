import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCampusMapCurrentPlace: vi.fn(),
  getCampusMapRevisionPhotoViews: vi.fn(),
  getOptionalUser: vi.fn(),
  getViewer: vi.fn(),
  publish: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/lib/campus-map/fact-store", () => ({
  getCampusMapCurrentPlace: mocks.getCampusMapCurrentPlace,
}));
vi.mock("@/lib/campus-map/place-photos", () => ({
  getCampusMapRevisionPhotoViews: mocks.getCampusMapRevisionPhotoViews,
}));
vi.mock("@/lib/auth-guard", () => ({
  getOptionalUser: mocks.getOptionalUser,
  getAuthenticatedUserForApi: mocks.getViewer,
  requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));
vi.mock("@/lib/campus-map/publish", () => ({
  publishCampusMapChangeset: mocks.publish,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import {
  loadCampusMapEditablePlace,
  publishCampusMapEdit,
} from "@/lib/campus-map/edit-actions";

describe("Campus Map edit action adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptionalUser.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.getViewer.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.getCampusMapRevisionPhotoViews.mockResolvedValue({});
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("keeps lifecycle commands out of the general contributor edit action", async () => {
    const command = {
      kind: "single" as const,
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      comment: "停用地点",
      sourceSummary: "现场核对",
      reviewRequested: false,
      client: { name: "test", version: "1" },
      warningAcknowledgements: [],
      changes: [
        {
          operation: "retire" as const,
          placeId: "20000000-0000-4000-8000-000000000001",
          baseRevisionId: "30000000-0000-4000-8000-000000000001",
          sources: [],
        },
      ],
    };

    mocks.publish.mockResolvedValueOnce({
      status: "forbidden",
      code: "admin-required",
    });
    await expect(publishCampusMapEdit(command, "user-1")).resolves.toEqual({
      status: "forbidden",
      code: "admin-required",
    });
    expect(mocks.publish).toHaveBeenCalledOnce();

    mocks.publish.mockClear();
    mocks.getOptionalUser.mockResolvedValueOnce({
      id: "admin-1",
      role: "admin",
    });
    mocks.getViewer.mockResolvedValueOnce({ id: "admin-1", role: "admin" });
    await expect(publishCampusMapEdit(command, "admin-1")).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "lifecycle-action-required",
          anchor: { field: "operation", placeId: command.changes[0].placeId },
        },
      ],
      warnings: [],
      suggestions: [],
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("preserves publish-seam validation and banned-user semantics", async () => {
    const invalidCommand = null as unknown as Parameters<
      typeof publishCampusMapEdit
    >[0];
    mocks.publish.mockResolvedValueOnce({
      status: "validation-failed",
      errors: [{ code: "invalid-command" }],
      warnings: [],
      suggestions: [],
    });
    await expect(
      publishCampusMapEdit(invalidCommand, "user-1"),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "invalid-command" }],
    });

    mocks.publish.mockResolvedValueOnce({
      status: "forbidden",
      code: "actor-banned",
    });
    await expect(
      publishCampusMapEdit(
        {
          kind: "single",
          idempotencyKey: "10000000-0000-4000-8000-000000000001",
          comment: "更新",
          sourceSummary: "现场核对",
          reviewRequested: false,
          client: { name: "test", version: "1" },
          warningAcknowledgements: [],
          changes: [],
        },
        "user-1",
      ),
    ).resolves.toEqual({ status: "forbidden", code: "actor-banned" });
  });

  it("projects canonical building and floor labels alongside stable IDs", async () => {
    const placeId = "20000000-0000-4000-8000-000000000001";
    const revisionId = "30000000-0000-4000-8000-000000000001";
    const buildingId = "50000000-0000-4000-8000-000000000001";
    const floorId = "60000000-0000-4000-8000-000000000001";
    mocks.getCampusMapCurrentPlace.mockResolvedValueOnce({
      id: placeId,
      revisionId,
      factSchemaVersion: 2,
      name: "科学馆饮水机",
      placeType: "water",
      regularHours: null,
      officialActions: [],
      visitNote: null,
      capabilities: [],
      gender: null,
      wheelchairAccess: null,
      location: {
        kind: "floor",
        building: {
          id: buildingId,
          name: "科学馆",
          englishName: "Science Centre",
          code: "SC",
        },
        floor: { id: floorId, displayLabel: "1/F", sortOrder: 1 },
      },
      observedAt: new Date("2026-08-25T04:00:00.000Z"),
      verifiedAt: null,
      publishedAt: new Date("2026-08-25T05:00:00.000Z"),
      provenance: [],
    });

    await expect(loadCampusMapEditablePlace(placeId)).resolves.toMatchObject({
      placeId,
      baseRevisionId: revisionId,
      fact: {
        buildingId,
        floorId,
        location: { kind: "floor" },
      },
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId,
        floorLabel: "1/F",
      },
      photos: [],
    });
  });
});
