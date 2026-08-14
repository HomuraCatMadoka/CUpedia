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
    expect(facility.state.sheet.snap).toBe("peek");
    expect(floor.history).toBe("replace");
    expect(floor.state.selection).toEqual({
      kind: "building",
      buildingId: "science",
    });
    expect(sheet.history).toBe("replace");
  });

  it("routes content through the same canonical selection transition", () => {
    const result = reduceCampusMapState(
      EMPTY_CAMPUS_MAP_STATE,
      { type: "select-content", contentId: "room401" },
      catalog,
    );

    expect(result.history).toBe("push");
    expect(result.state.selection).toEqual({
      kind: "content",
      buildingId: "science",
      contentKind: "classroom",
      contentId: "room401",
    });
    expect(result.state.buildingContext.floorId).toBe("2");
    expect(result.state.sheet.snap).toBe("full");
  });

  it("returns from a child to its canonical building without adding history", () => {
    const facility = parseCampusMapState(
      "building=library&facility=water&panel=full",
      catalog,
    );

    const result = reduceCampusMapState(
      facility,
      { type: "return-to-building" },
      catalog,
    );

    expect(result.history).toBe("replace");
    expect(result.state.selection).toEqual({
      kind: "building",
      buildingId: "library",
    });
    expect(result.state.buildingContext.floorId).toBe("3");
    expect(result.state.sheet.snap).toBe("peek");
  });

  it("replaces history when closing a selection", () => {
    const building = reduceCampusMapState(
      EMPTY_CAMPUS_MAP_STATE,
      { type: "select-building", buildingId: "science" },
      catalog,
    );

    const closed = reduceCampusMapState(
      building.state,
      { type: "close-selection" },
      catalog,
    );

    expect(closed.history).toBe("replace");
    expect(closed.state.selection).toEqual({ kind: "none" });
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
    ).toEqual({ kind: "none" });
  });

  it("keeps provider POI selection transient and out of the URL", () => {
    const result = reduceCampusMapState(
      EMPTY_CAMPUS_MAP_STATE,
      {
        type: "select-external",
        externalId: "amap-1",
        position: [114.2, 22.4],
      },
      catalog,
    );

    expect(result.state.selection.kind).toBe("external");
    expect(result.history).toBe("none");
    expect(serializeCampusMapState(result.state).toString()).toBe("");
  });

  it("keeps search and category browse filters mutually exclusive", () => {
    const category = reduceCampusMapState(
      {
        ...EMPTY_CAMPUS_MAP_STATE,
        mapFilter: { category: null, query: "科学馆" },
      },
      { type: "set-map-category", category: "water" },
      catalog,
    );
    const search = reduceCampusMapState(
      category.state,
      { type: "set-map-query", query: "图书馆" },
      catalog,
    );

    expect(category.state.mapFilter).toEqual({ category: "water", query: "" });
    expect(category.history).toBe("replace");
    expect(search.state.mapFilter).toEqual({ category: null, query: "图书馆" });
    expect(search.history).toBe("replace");
  });

  it("rejects unknown map and building amenity values at the state boundary", () => {
    const parsed = parseCampusMapState(
      "category=unknown&building=science&amenity=unknown&panel=peek",
      catalog,
    );

    expect(parsed.mapFilter.category).toBeNull();
    expect(parsed.buildingContext.amenity).toBeNull();
    expect(serializeCampusMapState(parsed).toString()).toBe(
      "building=science&panel=peek",
    );
  });

  it("owns the category result sheet snap in canonical map state", () => {
    const category = reduceCampusMapState(
      EMPTY_CAMPUS_MAP_STATE,
      { type: "set-map-category", category: "water" },
      catalog,
    );
    const full = reduceCampusMapState(
      category.state,
      { type: "set-sheet-snap", snap: "full" },
      catalog,
    );

    expect(category.state.sheet.snap).toBe("peek");
    expect(full.state.sheet.snap).toBe("full");
    expect(serializeCampusMapState(full.state).get("panel")).toBe("full");
    expect(
      parseCampusMapState(serializeCampusMapState(full.state), catalog),
    ).toEqual(full.state);
  });

  it("atomically returns an entity to a requested category surface", () => {
    const facility = parseCampusMapState(
      "category=water&building=library&facility=water&panel=peek",
      catalog,
    );
    const result = reduceCampusMapState(
      facility,
      { type: "open-category-results", category: "water" },
      catalog,
    );

    expect(result.state.mapFilter).toEqual({ category: "water", query: "" });
    expect(result.state.selection).toEqual({ kind: "none" });
    expect(result.state.buildingContext).toEqual({
      floorId: null,
      amenity: null,
      query: "",
    });
    expect(result.state.sheet.snap).toBe("peek");
    expect(result.history).toBe("push");
  });
});
