import { describe, expect, it } from "vitest";
import { groupCampusMapClassrooms } from "@/lib/campus-map/category-directory";
import type { CampusMapBrowsePlace } from "@/lib/campus-map/browse-projection";
import { createCampusMapBrowseFixture } from "../../helpers/campus-map-browse-projection";

describe("campus-wide classroom directory", () => {
  const fixture = createCampusMapBrowseFixture();
  const buildings = new Map(
    fixture.buildings.map((building) => [building.buildingId, building]),
  );
  const base = fixture.places[0]!;
  const room = (
    id: string,
    name: string,
    floorOrder: number | null,
  ): CampusMapBrowsePlace => ({
    ...base,
    placeId: id,
    name,
    placeType: "classroom",
    floorId: floorOrder === null ? null : `floor-${floorOrder}`,
    location:
      floorOrder === null
        ? {
            kind: "building",
            building: {
              id: base.buildingId!,
              name: "科学馆",
              englishName: null,
              code: null,
            },
          }
        : {
            kind: "floor",
            building: {
              id: base.buildingId!,
              name: "科学馆",
              englishName: null,
              code: null,
            },
            floor: {
              id: `floor-${floorOrder}`,
              displayLabel: String(floorOrder),
              sortOrder: floorOrder,
            },
          },
  });

  it("uses recorded Floor order before natural room numbers and leaves missing Floors last", () => {
    const rooms = [
      room("c", "SC 110", 1),
      room("d", "SC 2", null),
      room("a", "SC 12", 1),
      room("b", "SC B10", -1),
      room("e", "SC B2", -1),
    ];
    const original = [...rooms];
    expect(
      groupCampusMapClassrooms(rooms, buildings)[0]!.places.map(
        ({ name }) => name,
      ),
    ).toEqual(["SC B2", "SC B10", "SC 12", "SC 110", "SC 2"]);
    expect(rooms).toEqual(original);
    expect(rooms[1]!.floorId).toBeNull();
  });

  it("uses the shared Chinese name order inside a Floor", () => {
    const rooms = [room("b", "波室", 1), room("a", "阿室", 1)];

    expect(
      groupCampusMapClassrooms(rooms, buildings)[0]!.places.map(
        ({ name }) => name,
      ),
    ).toEqual(["阿室", "波室"]);
  });

  it("keeps same-named Buildings and rooms separate and has stable fallbacks for absent metadata", () => {
    const sameNameBuilding = {
      ...fixture.buildings[0]!,
      buildingId: "another-building",
      code: null,
    };
    const catalog = new Map([
      ...buildings,
      [sameNameBuilding.buildingId, sameNameBuilding] as const,
    ]);
    const rooms = [
      room("z", "SC 12", 1),
      room("a", "SC 12", 1),
      { ...room("b", "Room 2", null), buildingId: sameNameBuilding.buildingId },
      { ...room("c", "Room 3", null), buildingId: "missing-building" },
      { ...room("d", "Room 4", null), buildingId: null },
    ];
    const forward = groupCampusMapClassrooms(rooms, catalog);
    expect(groupCampusMapClassrooms([...rooms].reverse(), catalog)).toEqual(
      forward,
    );
    expect(forward).toHaveLength(4);
    expect(
      forward
        .find(({ buildingId }) => buildingId === base.buildingId)!
        .places.map(({ placeId }) => placeId),
    ).toEqual(["a", "z"]);
    expect(
      forward.find(({ buildingId }) => buildingId === "missing-building")!
        .building,
    ).toBeNull();
    expect(forward.flatMap(({ places }) => places)).toHaveLength(rooms.length);
  });
});
