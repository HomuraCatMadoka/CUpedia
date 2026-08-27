import { describe, expect, it } from "vitest";

import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";
import {
  createCampusMapSceneCatalog,
  createLegacyCampusMapCatalog,
} from "@/lib/campus-map/browse-scene-catalog";

const projection = {
  buildings: [
    {
      buildingId: "science",
      floors: [{ floorId: "G" }],
    },
  ],
  places: [
    {
      placeId: "indoor",
      buildingId: "science",
      floorId: "G",
      pinType: "water",
    },
    {
      placeId: "building-only",
      buildingId: "science",
      floorId: null,
      pinType: "water",
    },
    {
      placeId: "outdoor",
      buildingId: null,
      floorId: null,
      pinType: "water",
    },
  ],
  presences: [],
  markers: [],
} as unknown as CampusMapBrowseProjection;

describe("Campus Map browse scene catalog", () => {
  it("adapts only relations supported by the existing canonical scene owner", () => {
    const catalog = createCampusMapSceneCatalog(projection, ["water"]);

    expect(catalog.facilities).toEqual({
      indoor: {
        buildingId: "science",
        floorId: "G",
        category: "water",
      },
    });
  });

  it("isolates legacy query parsing behind an explicit adapter", () => {
    const catalog = createCampusMapSceneCatalog(projection, ["water"]);

    expect(createLegacyCampusMapCatalog(catalog).facilities).toEqual({
      indoor: {
        buildingId: "science",
        floorId: "G",
        category: "water",
      },
    });
  });
});
