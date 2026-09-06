/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import {
  campusMapAmapBuildingPositionKey,
  campusMapAmapCoordinateProjectionSignature,
  projectCampusMapBrowseToAmap,
} from "@/lib/campus-map/amap-browse-projection";
import { projectCampusMapBrowse } from "@/lib/campus-map/browse-projection";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";

const BUILDING_ID = "10000000-0000-4000-8000-000000000001";
const FLOOR_ID = "20000000-0000-4000-8000-000000000001";
const PLACE_ID = "30000000-0000-4000-8000-000000000001";

const place: CampusMapCurrentPlace = {
  id: PLACE_ID,
  revisionId: "40000000-0000-4000-8000-000000000001",
  factSchemaVersion: 2,
  name: "东翼洗手间",
  placeType: "toilet",
  regularHours: null,
  officialActions: [],
  visitNote: null,
  capabilities: [],
  gender: null,
  wheelchairAccess: null,
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
      placeType: "water",
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

describe("AMap browse projection adapter (#647)", () => {
  it("projects WGS84 entities locally without mutating the canonical source", () => {
    const original = structuredClone(projection);
    const result = projectCampusMapBrowseToAmap(projection, {
      selectedBuildingId: BUILDING_ID,
      visiblePlaceIds: [],
    });

    expect(result).toEqual({
      center: [114.212077, 22.416268],
      positions: {
        [campusMapAmapBuildingPositionKey(BUILDING_ID)]: [
          114.212887, 22.416828,
        ],
      },
      providerRequests: [],
    });
    expect(projection).toEqual(original);
  });

  it("projects only the selected canonical Building without provider requests", () => {
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
        selectedBuildingId: "building-40",
        visiblePlaceIds: [],
      },
    );

    expect(Object.keys(result.positions)).toHaveLength(1);
    expect(result.providerRequests).toEqual([]);
    expect(result.positions["building:building-40"]).toEqual([
      114.205277, 22.416168,
    ]);
  });

  it("projects every anchored canonical Building for location selection", () => {
    const result = projectCampusMapBrowseToAmap(projection, {
      selectedBuildingId: null,
      visiblePlaceIds: [],
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
      selectedBuildingId: null,
      visiblePlaceIds: [],
    });

    expect(result.positions).not.toHaveProperty(
      "place:30000000-0000-4000-8000-000000000002",
    );
    expect(result.providerRequests).toEqual([]);
  });

  it("routes a visible precise Place to the provider fallback", () => {
    const result = projectCampusMapBrowseToAmap(preciseOutdoorProjection, {
      selectedBuildingId: null,
      visiblePlaceIds: ["30000000-0000-4000-8000-000000000002"],
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
      selectedBuildingId: null,
      visiblePlaceIds: ["30000000-0000-4000-8000-000000000002"],
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
      selectedBuildingId: null,
      visiblePlaceIds: ["30000000-0000-4000-8000-000000000002"],
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
});
