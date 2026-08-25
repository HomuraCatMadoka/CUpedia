import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCampusMapCurrentPlace: vi.fn(),
}));

vi.mock("@/lib/campus-map/fact-store", () => ({
  getCampusMapCurrentPlace: mocks.getCampusMapCurrentPlace,
}));
vi.mock("@/lib/auth-guard", () => ({ getOptionalUser: vi.fn() }));
vi.mock("@/lib/campus-map/publish", () => ({
  publishCampusMapChangeset: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { loadCampusMapEditablePlace } from "@/lib/campus-map/edit-actions";

describe("Campus Map edit action adapter", () => {
  beforeEach(() => {
    mocks.getCampusMapCurrentPlace.mockReset();
  });

  it("projects canonical building and floor labels alongside stable IDs", async () => {
    const placeId = "20000000-0000-4000-8000-000000000001";
    const revisionId = "30000000-0000-4000-8000-000000000001";
    const buildingId = "50000000-0000-4000-8000-000000000001";
    const floorId = "60000000-0000-4000-8000-000000000001";
    mocks.getCampusMapCurrentPlace.mockResolvedValueOnce({
      id: placeId,
      revisionId,
      factSchemaVersion: 1,
      name: "科学馆饮水机",
      pinType: "water",
      capabilities: [],
      access: {
        audience: "cuhk-member",
        credentialRequirement: "unknown",
        schedule: { kind: "unknown" },
        reservationRequirement: "unknown",
        temporaryStatus: "unknown",
      },
      facets: { gender: "unknown", wheelchairAccess: "unknown" },
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
    });
  });
});
