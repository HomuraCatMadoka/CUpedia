/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import {
  CampusMapAmapPoiCardResolver,
  campusMapAmapCoordinateProjectionSignature,
  projectCampusMapAmapPoiCard,
  projectCampusMapBrowseToAmap,
} from "@/lib/campus-map/amap-browse-projection";
import { asAmapPosition } from "@/lib/campus-map/amap-position";
import { projectCampusMapBrowse } from "@/lib/campus-map/browse-projection";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";

const BUILDING_ID = "10000000-0000-4000-8000-000000000001";
const FLOOR_ID = "20000000-0000-4000-8000-000000000001";
const PLACE_ID = "30000000-0000-4000-8000-000000000001";

const place: CampusMapCurrentPlace = {
  id: PLACE_ID,
  revisionId: "40000000-0000-4000-8000-000000000001",
  factSchemaVersion: 1,
  name: "东翼洗手间",
  pinType: "toilet",
  capabilities: [],
  access: {
    audience: "public",
    credentialRequirement: "none",
    schedule: { kind: "unknown" },
    reservationRequirement: "none",
    temporaryStatus: "normal",
  },
  facets: { gender: "unknown", wheelchairAccess: "unknown" },
  location: {
    kind: "floor",
    building: {
      id: BUILDING_ID,
      name: "科学馆",
      englishName: "University Science Centre",
      code: "H10",
    },
    floor: { id: FLOOR_ID, displayLabel: "1/F", sortOrder: 1 },
  },
  observedAt: null,
  verifiedAt: null,
  publishedAt: new Date("2026-08-26T00:00:00.000Z"),
  provenance: [],
};

const projection = projectCampusMapBrowse({
  buildings: [
    {
      buildingId: BUILDING_ID,
      name: "科学馆",
      englishName: "University Science Centre",
      code: "H10",
      aliases: ["Science Centre"],
      anchor: { longitude: 114.20801, latitude: 22.41966, crs: "wgs84" },
      floors: [{ floorId: FLOOR_ID, displayLabel: "1/F", sortOrder: 1 }],
    },
  ],
  places: [place],
});

const preciseOutdoorProjection = projectCampusMapBrowse({
  buildings: [],
  places: [
    {
      ...place,
      id: "30000000-0000-4000-8000-000000000002",
      revisionId: "40000000-0000-4000-8000-000000000002",
      name: "林荫饮水点",
      pinType: "water",
      location: {
        kind: "outdoor-point",
        point: {
          longitude: 114.2078,
          latitude: 22.4188,
          crs: "wgs84",
          precision: "precise",
        },
      },
    },
  ],
});

const poi = {
  providerObjectId: "amap-science-centre",
  name: "高德科学馆",
  position: asAmapPosition([114.21801, 22.42966]),
};

describe("AMap browse projection adapter (#647)", () => {
  it("projects WGS84 entities locally without mutating the canonical source", () => {
    const original = structuredClone(projection);
    const result = projectCampusMapBrowseToAmap(projection, {
      visibleAmenity: null,
      selectedBuildingId: BUILDING_ID,
      selectedPlaceId: null,
    });

    expect(result).toEqual({
      center: [114.212077, 22.416268],
      positions: {
        [`building:${BUILDING_ID}`]: [114.212887, 22.416828],
      },
      providerRequests: [],
    });
    expect(projection).toEqual(original);
  });

  it("projects only the requested building instead of the full directory", () => {
    const buildings = Array.from({ length: 41 }, (_, index) => ({
      buildingId: `building-${index}`,
      name: `Building ${index}`,
      englishName: null,
      code: null,
      aliases: [],
      anchor: {
        longitude: 114.2 + index / 100_000,
        latitude: 22.419,
        crs: "wgs84" as const,
      },
      floors: [],
      placeIds: [],
      selectionTarget: {
        kind: "building" as const,
        buildingId: `building-${index}`,
      },
    }));
    const result = projectCampusMapBrowseToAmap(
      {
        buildings,
        places: [],
        presences: [],
        markers: [],
      },
      {
        visibleAmenity: null,
        selectedBuildingId: "building-40",
        selectedPlaceId: null,
      },
    );

    expect(Object.keys(result.positions)).toEqual(["building:building-40"]);
    expect(result.positions["building:building-40"]).toEqual([
      114.205277, 22.416168,
    ]);
  });

  it("projects every anchored canonical Building for location selection", () => {
    const result = projectCampusMapBrowseToAmap(projection, {
      visibleAmenity: null,
      selectedBuildingId: null,
      selectedPlaceId: null,
      allBuildings: true,
    });

    expect(result.positions).toHaveProperty(`building:${BUILDING_ID}`);
  });

  it("does not expose asynchronous coordinate projection state", () => {
    const result = projectCampusMapBrowseToAmap(projection);

    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("offset");
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("does not project a precise Place until that overlay is requested", () => {
    const result = projectCampusMapBrowseToAmap(preciseOutdoorProjection, {
      visibleAmenity: null,
      selectedBuildingId: null,
      selectedPlaceId: null,
    });

    expect(result.positions).not.toHaveProperty(
      "place:30000000-0000-4000-8000-000000000002",
    );
    expect(result.providerRequests).toEqual([]);
  });

  it("routes a visible precise Place to the provider fallback", () => {
    const result = projectCampusMapBrowseToAmap(preciseOutdoorProjection, {
      visibleAmenity: "water",
      selectedBuildingId: null,
      selectedPlaceId: null,
    });

    expect(result.positions).not.toHaveProperty(
      "place:30000000-0000-4000-8000-000000000002",
    );
    expect(result.providerRequests).toEqual([
      {
        key: "place:30000000-0000-4000-8000-000000000002",
        position: [114.2078, 22.4188],
      },
    ]);
  });

  it("keeps the coordinate signature stable across non-coordinate refreshes", () => {
    const demand = {
      visibleAmenity: "water" as const,
      selectedBuildingId: null,
      selectedPlaceId: null,
    };
    const original = projectCampusMapBrowseToAmap(
      preciseOutdoorProjection,
      demand,
    );
    const renamed = projectCampusMapBrowseToAmap(
      {
        ...preciseOutdoorProjection,
        places: preciseOutdoorProjection.places.map((candidate) => ({
          ...candidate,
          name: `${candidate.name}（已更新）`,
        })),
      },
      demand,
    );

    expect(campusMapAmapCoordinateProjectionSignature(renamed)).toBe(
      campusMapAmapCoordinateProjectionSignature(original),
    );
  });

  it("changes the coordinate signature when provider demand moves", () => {
    const demand = {
      visibleAmenity: "water" as const,
      selectedBuildingId: null,
      selectedPlaceId: null,
    };
    const original = projectCampusMapBrowseToAmap(
      preciseOutdoorProjection,
      demand,
    );
    const moved = projectCampusMapBrowseToAmap(
      {
        ...preciseOutdoorProjection,
        markers: preciseOutdoorProjection.markers.map((candidate) =>
          candidate.kind === "place"
            ? {
                ...candidate,
                position: {
                  ...candidate.position,
                  longitude: candidate.position.longitude + 0.0001,
                },
              }
            : candidate,
        ),
      },
      demand,
    );

    expect(campusMapAmapCoordinateProjectionSignature(moved)).not.toBe(
      campusMapAmapCoordinateProjectionSignature(original),
    );
  });

  it("projects only explicit public mappings to canonical cards", () => {
    expect(
      projectCampusMapAmapPoiCard(projection, poi, {
        kind: "place",
        placeId: PLACE_ID,
        buildingId: BUILDING_ID,
        floorId: FLOOR_ID,
      }),
    ).toEqual({
      kind: "linked",
      title: "东翼洗手间",
      selectionTarget: projection.places[0]!.selectionTarget,
    });

    expect(projectCampusMapAmapPoiCard(projection, poi, null)).toEqual({
      kind: "transient",
      externalId: poi.providerObjectId,
      title: "高德科学馆",
      position: poi.position,
    });
  });

  it("fails a stale or non-public mapping closed as a transient provider card", () => {
    expect(
      projectCampusMapAmapPoiCard(projection, poi, {
        kind: "place",
        placeId: "30000000-0000-4000-8000-000000000099",
        buildingId: null,
        floorId: null,
      }),
    ).toMatchObject({ kind: "transient", title: "高德科学馆" });
  });

  it("owns provider lookup races outside React", async () => {
    const pending: Array<
      (card: ReturnType<typeof projectCampusMapAmapPoiCard>) => void
    > = [];
    const resolver = new CampusMapAmapPoiCardResolver(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const first = resolver.resolveLatest(poi);
    const second = resolver.resolveLatest({ ...poi, providerObjectId: "new" });
    pending[1]!(projectCampusMapAmapPoiCard(projection, poi, null));
    pending[0]!(projectCampusMapAmapPoiCard(projection, poi, null));

    await expect(second).resolves.toMatchObject({ status: "resolved" });
    await expect(first).resolves.toEqual({ status: "superseded" });
  });
});
