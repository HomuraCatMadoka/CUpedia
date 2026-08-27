import { describe, expect, it } from "vitest";

import { projectCampusMapBuildingDirectory } from "@/lib/campus-map/building-directory";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

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
