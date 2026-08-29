/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import {
  CampusMapAmapCoordinateProjector,
  CampusMapAmapPoiCardResolver,
  projectCampusMapAmapPoiCard,
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

const poi = {
  providerObjectId: "amap-science-centre",
  name: "高德科学馆",
  position: [114.21801, 22.42966] as const,
};

describe("AMap browse projection adapter (#647)", () => {
  it("projects WGS84 entities through one adapter without mutating the canonical source", async () => {
    const original = structuredClone(projection);
    const result = await projectCampusMapBrowseToAmap(projection, {
      convertFrom(positions, _source, callback) {
        const sourceSnapshot = positions.map(
          ([longitude, latitude]) => [longitude, latitude] as const,
        );
        const mutable = positions as Array<[number, number]>;
        mutable[0]![0] += 100;
        callback("complete", {
          locations: sourceSnapshot.map(([longitude, latitude]) => ({
            lng: longitude + 0.01,
            lat: latitude + 0.02,
          })),
        });
      },
    });

    expect(result).toEqual({
      status: "ready",
      center: [114.2172, 22.4391],
      offset: [0.01, 0.02],
      positions: {
        [`building:${BUILDING_ID}`]: [114.21801, 22.43966],
      },
    });
    expect(projection).toEqual(original);
  });

  it("fails the whole provider coordinate projection closed on malformed output", async () => {
    await expect(
      projectCampusMapBrowseToAmap(projection, {
        convertFrom(_positions, _source, callback) {
          callback("complete", { locations: [{ lng: 114.2, lat: 22.4 }] });
        },
      }),
    ).resolves.toEqual({ status: "error" });
  });

  it("lets only the latest coordinate projection commit", async () => {
    const callbacks: Array<
      (
        status: "complete" | "error",
        result: { locations?: ReadonlyArray<{ lng: number; lat: number }> },
      ) => void
    > = [];
    const projector = new CampusMapAmapCoordinateProjector();
    const converter = {
      convertFrom(
        _positions: ReadonlyArray<readonly [number, number]>,
        _source: "gps",
        callback: (typeof callbacks)[number],
      ) {
        callbacks.push(callback);
      },
    };

    const first = projector.projectLatest(projection, converter);
    const second = projector.projectLatest(projection, converter);
    callbacks[1]!("error", {});
    callbacks[0]!("error", {});

    await expect(second).resolves.toEqual({ status: "error" });
    await expect(first).resolves.toEqual({ status: "superseded" });
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
