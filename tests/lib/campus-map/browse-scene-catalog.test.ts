import { describe, expect, it } from "vitest";

import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";
import { createCampusMapSceneCatalog } from "@/lib/campus-map/browse-scene-catalog";

const projection = {
  buildings: [
    {
      buildingId: "science",
      anchor: { longitude: 114.2, latitude: 22.4, crs: "wgs84" },
      floors: [{ floorId: "G" }],
    },
  ],
  places: [
    {
      placeId: "indoor",
      buildingId: "science",
      floorId: "G",
      placeType: "water",
      location: { kind: "floor" },
    },
    {
      placeId: "building-only",
      buildingId: "science",
      floorId: null,
      placeType: "water",
      location: { kind: "building" },
    },
    {
      placeId: "outdoor",
      buildingId: null,
      floorId: null,
      placeType: "water",
      location: { kind: "outdoor-point" },
    },
  ],
  presences: [],
  markers: [],
} as unknown as CampusMapBrowseProjection;

describe("Campus Map browse scene catalog", () => {
  it("adapts every stable Place with nullable browse and camera context", () => {
    const catalog = createCampusMapSceneCatalog(projection, ["water"]);

    expect(catalog.places).toEqual({
      indoor: {
        buildingId: "science",
        floorId: "G",
        category: "water",
        cameraTarget: "building-anchor",
      },
      "building-only": {
        buildingId: "science",
        floorId: null,
        category: "water",
        cameraTarget: "building-anchor",
      },
      outdoor: {
        buildingId: null,
        floorId: null,
        category: "water",
        cameraTarget: "place-point",
      },
    });
  });

  it("keeps a Place selectable when its Building has no camera anchor", () => {
    const withoutAnchor = {
      ...projection,
      buildings: projection.buildings.map((building) => ({
        ...building,
        anchor: null,
      })),
    };

    expect(
      createCampusMapSceneCatalog(withoutAnchor, ["water"]).places[
        "building-only"
      ],
    ).toMatchObject({
      buildingId: "science",
      floorId: null,
      cameraTarget: null,
    });
  });
});
