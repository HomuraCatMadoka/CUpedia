import { describe, expect, it } from "vitest";

import {
  resolveCampusMapProviderHotspot,
  suggestCampusMapHotspotBuildings,
  type CampusMapProviderHotspotInput,
} from "@/lib/campus-map/provider-hotspot";
import type { CampusMapProviderMappingProjection } from "@/lib/campus-map/provider-mapping-domain";
import { createCampusMapBrowseFixture } from "../../helpers/campus-map-browse-projection";

const projection = createCampusMapBrowseFixture();
const building = projection.buildings[0]!;
const place = projection.places[0]!;

function hotspot(
  providerObjectId: string | null,
): CampusMapProviderHotspotInput {
  return {
    providerObjectId,
    name: "高德地点名称",
  };
}

describe("resolveCampusMapProviderHotspot", () => {
  it("opens an exact Building mapping as the canonical Building", () => {
    const mappings: CampusMapProviderMappingProjection[] = [
      {
        providerObjectId: "B0J2RXUQB6",
        target: { kind: "building", buildingId: building.buildingId },
      },
    ];

    expect(
      resolveCampusMapProviderHotspot(
        projection,
        mappings,
        hotspot("B0J2RXUQB6"),
      ),
    ).toEqual({ kind: "building", building });
  });

  it("opens an exact Place mapping as the canonical Place", () => {
    const mappings: CampusMapProviderMappingProjection[] = [
      {
        providerObjectId: "mapped-place",
        target: { kind: "place", placeId: place.placeId },
      },
    ];

    expect(
      resolveCampusMapProviderHotspot(
        projection,
        mappings,
        hotspot("mapped-place"),
      ),
    ).toEqual({ kind: "place", place });
  });

  it("does not use a name or a nearby position as identity", () => {
    const mappings: CampusMapProviderMappingProjection[] = [
      {
        providerObjectId: "different-id",
        target: { kind: "building", buildingId: building.buildingId },
      },
    ];

    expect(
      resolveCampusMapProviderHotspot(
        projection,
        mappings,
        hotspot("unmapped-id"),
      ),
    ).toEqual({
      kind: "transient",
      name: "高德地点名称",
      providerObjectId: "unmapped-id",
    });
  });

  it("falls back to a transient card when a mapped target is not public", () => {
    const mappings: CampusMapProviderMappingProjection[] = [
      {
        providerObjectId: "stale-place",
        target: { kind: "place", placeId: "missing-place" },
      },
    ];

    expect(
      resolveCampusMapProviderHotspot(
        projection,
        mappings,
        hotspot("stale-place"),
      ),
    ).toMatchObject({
      kind: "transient",
      name: "高德地点名称",
    });
  });

  it("keeps a no-id hotspot as transient presentation only", () => {
    expect(
      resolveCampusMapProviderHotspot(projection, [], hotspot(null)),
    ).toEqual({
      kind: "transient",
      name: "高德地点名称",
      providerObjectId: null,
    });
  });
});

it("suggests a named building without resolving an unverified hotspot as its identity", () => {
  expect(
    suggestCampusMapHotspotBuildings(projection.buildings, building.name),
  ).toContain(building);
  expect(
    suggestCampusMapHotspotBuildings(projection.buildings, "没有此建筑"),
  ).toEqual([]);
  expect(
    resolveCampusMapProviderHotspot(projection, [], {
      providerObjectId: "unknown",
      name: building.name,
    }).kind,
  ).toBe("transient");
});

it("does not offer a complex as the building for a similarly named wing", () => {
  expect(
    suggestCampusMapHotspotBuildings([building], `${building.name}东座`),
  ).toEqual([]);
});
