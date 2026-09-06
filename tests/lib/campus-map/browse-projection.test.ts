import { describe, expect, it } from "vitest";

import {
  projectCampusMapBrowse,
  queryCampusMapBrowse,
  queryCampusMapNearby,
  readCampusMapBrowse,
  searchCampusMapBrowse,
} from "@/lib/campus-map/browse-projection";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";

const BUILDING_ID = "10000000-0000-4000-8000-000000000001";
const FLOOR_ID = "20000000-0000-4000-8000-000000000001";

const building = {
  buildingId: BUILDING_ID,
  name: "科学馆",
  englishName: "University Science Centre",
  code: "H10",
  aliases: ["Science Centre"],
  anchor: { longitude: 114.20801, latitude: 22.41966, crs: "wgs84" },
  floors: [{ floorId: FLOOR_ID, displayLabel: "1/F", sortOrder: 1 }],
} as const;

function floorPlace(
  placeId: string,
  revisionId: string,
): CampusMapCurrentPlace {
  return {
    id: placeId,
    revisionId,
    factSchemaVersion: 2,
    name: "洗手间",
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
}

function outdoorPlace(
  placeId: string,
  revisionId: string,
): CampusMapCurrentPlace {
  return {
    ...floorPlace(placeId, revisionId),
    name: "饮水机",
    placeType: "water",
    location: {
      kind: "outdoor-point",
      point: {
        longitude: 114.21,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
      },
    },
  };
}

describe("Campus Map browse projection (#647)", () => {
  it("returns an empty browse model when there are no public Current facts", () => {
    expect(projectCampusMapBrowse({ buildings: [], places: [] })).toEqual({
      buildings: [],
      places: [],
      presences: [],
      markers: [],
    });
  });

  it("keeps same-floor same-type Places distinct while aggregating one Building presence", () => {
    const firstPlaceId = "30000000-0000-4000-8000-000000000001";
    const secondPlaceId = "30000000-0000-4000-8000-000000000002";
    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [
        floorPlace(firstPlaceId, "40000000-0000-4000-8000-000000000001"),
        floorPlace(secondPlaceId, "40000000-0000-4000-8000-000000000002"),
      ],
    });

    expect(
      projection.places.map(({ placeId, buildingId, floorId, placeType }) => ({
        placeId,
        buildingId,
        floorId,
        placeType,
      })),
    ).toEqual([
      {
        placeId: firstPlaceId,
        buildingId: BUILDING_ID,
        floorId: FLOOR_ID,
        placeType: "toilet",
      },
      {
        placeId: secondPlaceId,
        buildingId: BUILDING_ID,
        floorId: FLOOR_ID,
        placeType: "toilet",
      },
    ]);
    expect(projection.presences).toEqual([
      {
        buildingId: BUILDING_ID,
        placeType: "toilet",
        placeIds: [firstPlaceId, secondPlaceId],
        floorIds: [FLOOR_ID],
      },
    ]);
    expect(projection.markers).toEqual([
      {
        kind: "building-presence",
        buildingId: BUILDING_ID,
        placeType: "toilet",
        placeIds: [firstPlaceId, secondPlaceId],
        position: {
          longitude: 114.20801,
          latitude: 22.41966,
          crs: "wgs84",
        },
      },
    ]);
  });

  it("keeps co-located outdoor Places as independent precise-aware markers", () => {
    const firstPlaceId = "30000000-0000-4000-8000-000000000003";
    const secondPlaceId = "30000000-0000-4000-8000-000000000004";
    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [
        outdoorPlace(firstPlaceId, "40000000-0000-4000-8000-000000000003"),
        outdoorPlace(secondPlaceId, "40000000-0000-4000-8000-000000000004"),
      ],
    });

    expect(
      projection.places.map(({ placeId, buildingId, floorId }) => ({
        placeId,
        buildingId,
        floorId,
      })),
    ).toEqual([
      { placeId: firstPlaceId, buildingId: null, floorId: null },
      { placeId: secondPlaceId, buildingId: null, floorId: null },
    ]);
    expect(projection.presences).toEqual([]);
    expect(projection.markers).toEqual([
      {
        kind: "place",
        placeId: firstPlaceId,
        placeType: "water",
        position: {
          longitude: 114.21,
          latitude: 22.42,
          crs: "wgs84",
          precision: "approximate",
        },
      },
      {
        kind: "place",
        placeId: secondPlaceId,
        placeType: "water",
        position: {
          longitude: 114.21,
          latitude: 22.42,
          crs: "wgs84",
          precision: "approximate",
        },
      },
    ]);
  });

  it("filters an invalid point fact and fails a bad Building anchor closed", () => {
    const invalidPoint = {
      ...outdoorPlace(
        "30000000-0000-4000-8000-000000000009",
        "40000000-0000-4000-8000-000000000009",
      ),
      location: {
        kind: "outdoor-point",
        point: {
          longitude: Number.NaN,
          latitude: 122,
          crs: "wgs84",
          precision: "precise",
        },
      },
    } as CampusMapCurrentPlace;
    const projection = projectCampusMapBrowse({
      buildings: [
        {
          ...building,
          anchor: { longitude: 214, latitude: 22.4, crs: "wgs84" },
        },
      ],
      places: [
        floorPlace(
          "30000000-0000-4000-8000-000000000010",
          "40000000-0000-4000-8000-000000000010",
        ),
        invalidPoint,
      ],
    });

    expect(projection.places.map((place) => place.placeId)).toEqual([
      "30000000-0000-4000-8000-000000000010",
    ]);
    expect(projection.buildings[0]?.anchor).toBeNull();
    expect(projection.markers).toEqual([]);
  });

  it("fails duplicate revisions for one Place closed instead of inventing another Current selector", () => {
    const placeId = "30000000-0000-4000-8000-000000000014";
    const older = floorPlace(placeId, "40000000-0000-4000-8000-000000000014");
    const newer = {
      ...floorPlace(placeId, "40000000-0000-4000-8000-000000000015"),
      name: "新名称",
      publishedAt: new Date("2026-08-27T00:00:00.000Z"),
    };

    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [older, newer],
    });

    expect(projection.places).toEqual([]);
    expect(projection.buildings[0]?.placeIds).toEqual([]);
    expect(projection.presences).toEqual([]);
    expect(projection.markers).toEqual([]);
  });

  it("projects published V2 Place types into public browse and markers", () => {
    const sportsFacility = {
      ...floorPlace(
        "30000000-0000-4000-8000-000000000021",
        "40000000-0000-4000-8000-000000000021",
      ),
      name: "大学游泳池",
      placeType: "sports-facility" as const,
    };

    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [sportsFacility],
    });

    expect(projection.places).toMatchObject([
      { name: "大学游泳池", placeType: "sports-facility" },
    ]);
    expect(projection.presences).toMatchObject([
      { buildingId: BUILDING_ID, placeType: "sports-facility" },
    ]);
    expect(projection.markers).toMatchObject([
      {
        kind: "building-presence",
        buildingId: BUILDING_ID,
        placeType: "sports-facility",
      },
    ]);
  });

  it("returns every matching Place with honest Building, location, and equipment counts", () => {
    const firstPlaceId = "30000000-0000-4000-8000-000000000005";
    const secondPlaceId = "30000000-0000-4000-8000-000000000006";
    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [
        floorPlace(firstPlaceId, "40000000-0000-4000-8000-000000000005"),
        floorPlace(secondPlaceId, "40000000-0000-4000-8000-000000000006"),
      ],
    });

    const results = queryCampusMapBrowse(projection, {
      query: "科学馆 洗手间",
      placeType: "toilet",
    });

    expect(results.places.map((place) => place.placeId)).toEqual([
      firstPlaceId,
      secondPlaceId,
    ]);
    expect(results.buildings.map((item) => item.buildingId)).toEqual([
      BUILDING_ID,
    ]);
    expect(results.counts).toEqual({
      buildings: 1,
      locations: 2,
      equipment: "unknown",
    });
  });

  it("counts a Building-only search result without inventing a location", () => {
    const results = queryCampusMapBrowse(
      projectCampusMapBrowse({ buildings: [building], places: [] }),
      { query: "H10" },
    );

    expect(results.buildings.map((item) => item.buildingId)).toEqual([
      BUILDING_ID,
    ]);
    expect(results.counts).toEqual({
      buildings: 1,
      locations: 0,
      equipment: "unknown",
    });
  });

  it("keeps an independently named Building out of its complex's aliases", () => {
    const highKunBuildingId = "10000000-0000-4000-8000-000000000002";
    const projection = projectCampusMapBrowse({
      buildings: [
        building,
        {
          buildingId: highKunBuildingId,
          name: "高锟楼",
          englishName: "Charles Kuen Kao Building",
          code: null,
          aliases: ["高錕樓", "科学馆北座高锟楼"],
          anchor: null,
          floors: [],
        },
      ],
      places: [],
    });

    expect(
      queryCampusMapBrowse(projection, { query: "高锟楼" }).buildings.map(
        (item) => item.buildingId,
      ),
    ).toEqual([highKunBuildingId]);
    expect(
      queryCampusMapBrowse(projection, {
        query: "Charles Kuen Kao",
      }).buildings.map((item) => item.buildingId),
    ).toEqual([highKunBuildingId]);
  });

  it("can limit Place matches to their own names without rebuilding search rules in React", () => {
    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [
        floorPlace(
          "30000000-0000-4000-8000-000000000016",
          "40000000-0000-4000-8000-000000000016",
        ),
      ],
    });

    const results = queryCampusMapBrowse(projection, {
      query: "科学馆",
      placeMatch: "name",
    });

    expect(results.buildings).toHaveLength(1);
    expect(results.places).toEqual([]);
  });

  it("opens one exact classroom Place before its sourced Building context", () => {
    const bmsBuilding = {
      ...building,
      name: "李卓敏基本医学大楼",
      englishName: "Choh-Ming Li Basic Medical Sciences Building",
      code: "H11",
      aliases: ["BMS"],
    };
    const classroom = {
      ...floorPlace(
        "30000000-0000-4000-8000-000000000031",
        "40000000-0000-4000-8000-000000000031",
      ),
      name: "BMS LT",
      placeType: "classroom" as const,
      location: {
        kind: "building" as const,
        building: {
          id: BUILDING_ID,
          name: bmsBuilding.name,
          englishName: bmsBuilding.englishName,
          code: bmsBuilding.code,
        },
      },
    };
    const projection = projectCampusMapBrowse({
      buildings: [bmsBuilding],
      places: [classroom],
    });

    expect(searchCampusMapBrowse(projection, "BMS LT")).toMatchObject([
      {
        kind: "place",
        match: "exact-name",
        place: { placeId: classroom.id },
      },
    ]);
    expect(
      searchCampusMapBrowse(projection, "李卓敏基本医学大楼 LT"),
    ).toMatchObject([{ kind: "place", place: { placeId: classroom.id } }]);
  });

  it("labels an evidence-backed classroom Building fallback without inventing a Place", () => {
    const bmsBuilding = {
      ...building,
      name: "李卓敏基本医学大楼",
      englishName: "Choh-Ming Li Basic Medical Sciences Building",
      code: "H11",
      aliases: ["BMS"],
    };
    const projection = projectCampusMapBrowse({
      buildings: [bmsBuilding],
      places: [],
    });

    expect(searchCampusMapBrowse(projection, "BMS LT3")).toMatchObject([
      {
        kind: "building",
        match: "classroom-fallback",
        building: { buildingId: BUILDING_ID },
      },
    ]);
    expect(searchCampusMapBrowse(projection, "不存在建筑 LT3")).toEqual([]);
  });

  it("resolves Chinese and English Place names to one pool identity", () => {
    const pool = {
      ...outdoorPlace(
        "30000000-0000-4000-8000-000000000032",
        "40000000-0000-4000-8000-000000000032",
      ),
      name: "大学游泳池（University Swimming Pool）",
      placeType: "sports-facility" as const,
    };
    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [pool],
    });

    for (const query of ["大学游泳池", "University Swimming Pool"]) {
      expect(searchCampusMapBrowse(projection, query)).toMatchObject([
        {
          kind: "place",
          match: "exact-name",
          place: { placeId: pool.id },
        },
      ]);
    }
  });

  it("keeps two health services independently selectable by their own names", () => {
    const healthBuilding = {
      ...building,
      name: "保健处",
      englishName: "University Health Centre",
      code: "UHC",
      aliases: ["大学保健处"],
    };
    const healthPlace = (
      idSuffix: string,
      name: string,
    ): CampusMapCurrentPlace => ({
      ...floorPlace(
        `30000000-0000-4000-8000-0000000000${idSuffix}`,
        `40000000-0000-4000-8000-0000000000${idSuffix}`,
      ),
      name,
      placeType: "health-service",
      location: {
        kind: "building",
        building: {
          id: BUILDING_ID,
          name: healthBuilding.name,
          englishName: healthBuilding.englishName,
          code: healthBuilding.code,
        },
      },
    });
    const outpatient = healthPlace("33", "门诊（Outpatient Service）");
    const dental = healthPlace("34", "牙科（Dental Service）");
    const projection = projectCampusMapBrowse({
      buildings: [healthBuilding],
      places: [outpatient, dental],
    });

    expect(searchCampusMapBrowse(projection, "门诊")).toMatchObject([
      { kind: "place", place: { placeId: outpatient.id } },
    ]);
    expect(
      searchCampusMapBrowse(projection, "Service").map((result) =>
        result.kind === "place" ? result.place.placeId : result.kind,
      ),
    ).toEqual([outpatient.id, dental.id]);
  });

  it("returns nearby Places separately and labels Building-anchor distances as approximate evidence", () => {
    const firstPlaceId = "30000000-0000-4000-8000-000000000011";
    const secondPlaceId = "30000000-0000-4000-8000-000000000012";
    const projection = projectCampusMapBrowse({
      buildings: [building],
      places: [
        floorPlace(firstPlaceId, "40000000-0000-4000-8000-000000000011"),
        floorPlace(secondPlaceId, "40000000-0000-4000-8000-000000000012"),
        outdoorPlace(
          "30000000-0000-4000-8000-000000000013",
          "40000000-0000-4000-8000-000000000013",
        ),
      ],
    });

    const nearby = queryCampusMapNearby(projection, {
      longitude: 114.20801,
      latitude: 22.41966,
      maxDistanceMeters: 500,
    });

    expect(
      nearby.places.map(({ place, distanceEvidence }) => ({
        placeId: place.placeId,
        distanceEvidence,
      })),
    ).toEqual([
      { placeId: firstPlaceId, distanceEvidence: "building-anchor" },
      { placeId: secondPlaceId, distanceEvidence: "building-anchor" },
      {
        placeId: "30000000-0000-4000-8000-000000000013",
        distanceEvidence: "place-point",
      },
    ]);
    expect(nearby.counts).toEqual({
      buildings: 1,
      locations: 3,
      equipment: "unknown",
    });
  });

  it("hides fact-store pagination and includes a newly published Place", async () => {
    const published = outdoorPlace(
      "30000000-0000-4000-8000-000000000007",
      "40000000-0000-4000-8000-000000000007",
    );
    const pages = [
      {
        items: [
          floorPlace(
            "30000000-0000-4000-8000-000000000008",
            "40000000-0000-4000-8000-000000000008",
          ),
        ],
        nextCursor: "30000000-0000-4000-8000-000000000008",
      },
      { items: [published], nextCursor: null },
    ];
    const requestedCursors: Array<string | undefined> = [];

    const projection = await readCampusMapBrowse({
      listBuildings: async () => [building],
      listCurrentPlaces: async ({ afterPlaceId }) => {
        requestedCursors.push(afterPlaceId);
        return pages[requestedCursors.length - 1]!;
      },
    });

    expect(requestedCursors).toEqual([
      undefined,
      "30000000-0000-4000-8000-000000000008",
    ]);
    expect(projection.places.map((place) => place.placeId)).toContain(
      published.id,
    );
  });
});
