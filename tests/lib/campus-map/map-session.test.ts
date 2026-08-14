import { describe, expect, it } from "vitest";

import {
  EMPTY_CAMPUS_MAP_STATE,
  parseCampusMapState,
  type CampusMapCatalog,
} from "@/lib/campus-map/map-state";
import {
  EMPTY_CAMPUS_MAP_SESSION,
  initialCampusMapSession,
  reduceCampusMapSession,
} from "@/lib/campus-map/map-session";

const catalog: CampusMapCatalog = {
  buildings: { science: { floorIds: ["1"] } },
  facilities: {
    water: { buildingId: "science", floorId: "1", category: "water" },
  },
  contents: {
    room401: { buildingId: "science", kind: "classroom", floorId: "1" },
  },
};

describe("campus map browse session", () => {
  it("atomically owns browse selection and filters", () => {
    const category = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      { type: "toggle-map-category", category: "water" },
      catalog,
    );
    const facility = reduceCampusMapSession(
      category.session,
      { type: "open-facility", facilityId: "water", source: "map" },
      catalog,
    );

    expect(facility.session.browse.selection).toEqual({
      kind: "facility",
      buildingId: "science",
      facilityId: "water",
    });
    expect(facility.session.browse.mapFilter).toEqual({
      category: "water",
      query: "",
    });
    expect(facility.camera).toEqual({
      kind: "focus",
      buildingId: "science",
      reason: "facility-selection",
    });
  });

  it("clears a stale entity return target when navigating to category results", () => {
    const facility = parseCampusMapState(
      "category=water&building=science&facility=water&panel=peek",
      catalog,
    );
    const result = reduceCampusMapSession(
      initialCampusMapSession(facility, catalog),
      { type: "toggle-map-category", category: "water" },
      catalog,
    );

    expect(result.session.browse.selection.kind).toBe("none");
    expect(result.session.entityReturnTarget).toBeNull();
    expect(result.history).toBe("push");
  });

  it("keeps Back and dismiss semantics distinct", () => {
    const building = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      { type: "open-building", buildingId: "science", source: "map" },
      catalog,
    );
    const facility = reduceCampusMapSession(
      building.session,
      { type: "open-facility", facilityId: "water", source: "building" },
      catalog,
    );

    const back = reduceCampusMapSession(
      facility.session,
      { type: "navigate-back" },
      catalog,
    );
    const dismissed = reduceCampusMapSession(
      facility.session,
      { type: "dismiss-entity" },
      catalog,
    );

    expect(back.session.browse.selection).toEqual({
      kind: "building",
      buildingId: "science",
    });
    expect(back.history).toBe("back-or-push");
    expect(dismissed.session.browse.selection).toEqual({ kind: "none" });
    expect(dismissed.history).toBe("replace");
    expect(facility.camera).toEqual({ kind: "cancel" });
  });

  it("declares search camera policy as part of the building transition", () => {
    const result = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      { type: "open-building", buildingId: "science", source: "search" },
      catalog,
    );

    expect(result.camera).toEqual({
      kind: "focus",
      buildingId: "science",
      reason: "search-selection",
    });
  });

  it("opens content through the same session transition seam", () => {
    const result = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      { type: "open-content", contentId: "room401", source: "map" },
      catalog,
    );

    expect(result.session.browse.selection).toEqual({
      kind: "content",
      buildingId: "science",
      contentKind: "classroom",
      contentId: "room401",
    });
    expect(result.history).toBe("push");
    expect(result.camera).toEqual({
      kind: "focus",
      buildingId: "science",
      reason: "map-selection",
    });
  });

  it("opens an external provider target as a transient session overlay", () => {
    const result = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      {
        type: "open-external",
        externalId: "amap-east-wing",
        name: "科学馆东座",
        position: [114.2084, 22.4198],
      },
      catalog,
    );

    expect(result.session.browse.selection).toEqual({
      kind: "external",
      externalId: "amap-east-wing",
      position: [114.2084, 22.4198],
    });
    expect(result.history).toBe("none");
    expect(result.overlay).toEqual({
      kind: "open-external",
      externalId: "amap-east-wing",
      name: "科学馆东座",
      position: [114.2084, 22.4198],
    });
  });

  it("changes building tags and inside query without requesting camera work", () => {
    const building = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      { type: "open-building", buildingId: "science", source: "map" },
      catalog,
    );
    const amenity = reduceCampusMapSession(
      building.session,
      { type: "set-building-amenity", amenity: "water" },
      catalog,
    );
    const query = reduceCampusMapSession(
      amenity.session,
      { type: "set-building-query", query: "401" },
      catalog,
    );

    expect(query.session.browse.buildingContext).toEqual({
      floorId: null,
      amenity: "water",
      query: "401",
    });
    expect(amenity.camera).toBeNull();
    expect(query.camera).toBeNull();
    expect(query.history).toBe("replace");
  });

  it("declares layout camera work without changing browse state or history", () => {
    const building = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      { type: "open-building", buildingId: "science", source: "map" },
      catalog,
    );

    const result = reduceCampusMapSession(
      building.session,
      { type: "reframe-selection", reason: "sheet-layout" },
      catalog,
    );

    expect(result.session).toBe(building.session);
    expect(result.history).toBe("none");
    expect(result.camera).toEqual({
      kind: "focus",
      buildingId: "science",
      reason: "sheet-layout",
    });
  });

  it("restores a history snapshot and declares one restore camera effect", () => {
    const building = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      { type: "open-building", buildingId: "science", source: "map" },
      catalog,
    );

    const result = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      {
        type: "restore",
        session: building.session,
        cameraReason: "map-selection",
      },
      catalog,
    );

    expect(result.session).toBe(building.session);
    expect(result.history).toBe("none");
    expect(result.camera).toEqual({
      kind: "focus",
      buildingId: "science",
      reason: "map-selection",
    });
  });

  it("closes a transient external overlay when history restores browse state", () => {
    const external = reduceCampusMapSession(
      EMPTY_CAMPUS_MAP_SESSION,
      {
        type: "open-external",
        externalId: "amap-east-wing",
        name: "科学馆东座",
        position: [114.2084, 22.4198],
      },
      catalog,
    );

    const result = reduceCampusMapSession(
      external.session,
      {
        type: "restore",
        session: EMPTY_CAMPUS_MAP_SESSION,
      },
      catalog,
    );

    expect(result.session).toBe(EMPTY_CAMPUS_MAP_SESSION);
    expect(result.history).toBe("none");
    expect(result.overlay).toEqual({ kind: "close-external" });
  });

  it("creates a category return target for a facility deep link", () => {
    const browse = {
      ...EMPTY_CAMPUS_MAP_STATE,
      mapFilter: { category: "water", query: "" },
      selection: {
        kind: "facility",
        buildingId: "science",
        facilityId: "water",
      } as const,
      buildingContext: { floorId: "1", amenity: "water", query: "" },
      sheet: { snap: "peek" as const },
    };

    const session = initialCampusMapSession(browse, catalog);
    expect(session.entityReturnTarget?.selection).toEqual({ kind: "none" });
    expect(session.entityReturnTarget?.mapFilter.category).toBe("water");
    expect(session.entityReturnTarget?.sheet.snap).toBe("peek");
  });

  it("creates a building return target for an unfiltered facility deep link", () => {
    const browse = {
      ...EMPTY_CAMPUS_MAP_STATE,
      selection: {
        kind: "facility",
        buildingId: "science",
        facilityId: "water",
      } as const,
      buildingContext: { floorId: "1", amenity: "water", query: "" },
      sheet: { snap: "peek" as const },
    };

    expect(
      initialCampusMapSession(browse, catalog).entityReturnTarget?.selection,
    ).toEqual({ kind: "building", buildingId: "science" });
  });
});
