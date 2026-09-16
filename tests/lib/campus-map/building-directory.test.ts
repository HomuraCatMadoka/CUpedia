import { describe, expect, it } from "vitest";

import { projectCampusMapBuildingDirectory } from "@/lib/campus-map/building-directory";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";
import {
  createCampusMapSearchDirectoryFixture,
  YIA_BUILDING_ID,
  YIA_FLOOR_FOUR_ID,
} from "../../helpers/campus-map-search-directory";

const projection = {
  buildings: [
    {
      buildingId: "science",
      name: "科学馆",
      floors: [
        { floorId: "G", displayLabel: "G/F", sortOrder: 0 },
        { floorId: "1", displayLabel: "1/F", sortOrder: 1 },
      ],
    },
    { buildingId: "empty", name: "空建筑", floors: [] },
  ],
  places: [
    { placeId: "water-g", buildingId: "science", floorId: "G" },
    { placeId: "printer-1", buildingId: "science", floorId: "1" },
  ],
  presences: [],
  markers: [],
} as unknown as CampusMapBrowseProjection;

describe("canonical Building directory card state", () => {
  it("orders the available YIA floor 4 rooms by number without deriving containment from names (#909)", () => {
    const projection = createCampusMapSearchDirectoryFixture();
    const original = [...projection.places];
    const directory = projectCampusMapBuildingDirectory(
      { status: "ready", projection },
      YIA_BUILDING_ID,
      YIA_FLOOR_FOUR_ID,
    );
    expect(directory.places.map((place) => place.name)).toEqual(
      Array.from({ length: 11 }, (_, index) => `YIA ${401 + index}`),
    );
    expect(projection.places).toEqual(original);
    const unknown = {
      ...projection.places[0]!,
      floorId: null,
      name: "YIA 412",
    };
    expect(
      projectCampusMapBuildingDirectory(
        { status: "ready", projection: { ...projection, places: [unknown] } },
        YIA_BUILDING_ID,
        YIA_FLOOR_FOUR_ID,
      ).places,
    ).toEqual([]);
  });
  it("returns ready content from the Current-facts projection", () => {
    expect(
      projectCampusMapBuildingDirectory(
        { status: "ready", projection },
        "science",
        "G",
      ),
    ).toMatchObject({
      status: "ready",
      building: { buildingId: "science", name: "科学馆" },
      places: [{ placeId: "water-g" }],
    });
  });

  it("returns explicit empty, loading, and error states instead of a blank card", () => {
    expect(
      projectCampusMapBuildingDirectory(
        { status: "ready", projection },
        "empty",
        null,
      ).status,
    ).toBe("empty");
    expect(
      projectCampusMapBuildingDirectory(
        { status: "refreshing", projection },
        "science",
        null,
      ).status,
    ).toBe("loading");
    expect(
      projectCampusMapBuildingDirectory(
        { status: "error", projection },
        "science",
        null,
      ).status,
    ).toBe("error");
  });

  it("fails closed with an error card when the canonical Building is absent", () => {
    expect(
      projectCampusMapBuildingDirectory(
        { status: "ready", projection },
        "missing",
        null,
      ),
    ).toEqual({ status: "error", building: null, places: [] });
  });
});
