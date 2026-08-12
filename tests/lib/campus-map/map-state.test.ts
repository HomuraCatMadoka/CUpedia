import { describe, expect, it } from "vitest";

import {
  EMPTY_CAMPUS_MAP_STATE,
  parseCampusMapState,
  reduceCampusMapState,
  serializeCampusMapState,
  type CampusMapCatalog,
} from "@/lib/campus-map/map-state";

const catalog: CampusMapCatalog = {
  buildings: {
    science: { floorIds: ["LG", "1", "2"] },
    library: { floorIds: ["G", "1", "3"] },
  },
  facilities: {
    water: { buildingId: "library", floorId: "3", category: "water" },
    toilet: { buildingId: "science", floorId: "LG", category: "toilet" },
  },
  contents: {
    room401: { buildingId: "science", kind: "classroom", floorId: "2" },
  },
};

describe("campus map state", () => {
  it("uses a child record's canonical parent instead of a conflicting URL building", () => {
    const state = parseCampusMapState(
      "building=science&facility=water&floor=LG&panel=full",
      catalog,
    );

    expect(state.selection).toEqual({
      kind: "facility",
      buildingId: "library",
      facilityId: "water",
    });
    expect(state.buildingContext).toMatchObject({
      floorId: "3",
      amenity: null,
    });
  });

  it("removes invalid building, child and floor parameters", () => {
    expect(
      parseCampusMapState(
        "building=missing&facility=missing&floor=99&panel=full",
        catalog,
      ),
    ).toEqual(EMPTY_CAMPUS_MAP_STATE);

    const building = parseCampusMapState("building=science&floor=99", catalog);
    expect(building.selection).toEqual({
      kind: "building",
      buildingId: "science",
    });
    expect(building.buildingContext.floorId).toBeNull();
  });

  it("round-trips one unambiguous selection and its browsing context", () => {
    const state = parseCampusMapState(
      "category=toilet&query=accessible&building=science&content=room401&contentKind=wrong&amenity=toilet&insideQuery=ERB&panel=full",
      catalog,
    );
    const serialized = serializeCampusMapState(state);

    expect(parseCampusMapState(serialized, catalog)).toEqual(state);
    expect(serialized.get("contentKind")).toBe("classroom");
    expect(serialized.has("facility")).toBe(false);
  });

  it("uses push for semantic selection and replace for local filters", () => {
    const building = reduceCampusMapState(
      EMPTY_CAMPUS_MAP_STATE,
      { type: "select-building", buildingId: "science" },
      catalog,
    );
    const facility = reduceCampusMapState(
      building.state,
      { type: "select-facility", facilityId: "toilet" },
      catalog,
    );
    const floor = reduceCampusMapState(
      facility.state,
      { type: "set-building-floor", floorId: "1" },
      catalog,
    );
    const sheet = reduceCampusMapState(
      floor.state,
      { type: "set-sheet-snap", snap: "full" },
      catalog,
    );

    expect(building.history).toBe("push");
    expect(facility.history).toBe("push");
    expect(floor.history).toBe("replace");
    expect(floor.state.selection).toEqual({
      kind: "building",
      buildingId: "science",
    });
    expect(sheet.history).toBe("replace");
  });

  it("hydrates Back/Forward state without writing another history entry", () => {
    const restored = parseCampusMapState(
      "building=library&facility=water&panel=full",
      catalog,
    );
    const result = reduceCampusMapState(
      EMPTY_CAMPUS_MAP_STATE,
      { type: "hydrate", state: restored },
      catalog,
    );

    expect(result.history).toBe("none");
    expect(result.state).toEqual(restored);
  });

  it("rejects invalid external coordinates", () => {
    expect(
      parseCampusMapState("external=amap-1&lng=181&lat=22.4", catalog)
        .selection,
    ).toEqual({ kind: "none" });
    expect(
      parseCampusMapState("external=amap-1&lng=114.2&lat=22.4", catalog)
        .selection,
    ).toEqual({
      kind: "external",
      externalId: "amap-1",
      position: [114.2, 22.4],
    });
  });
});
