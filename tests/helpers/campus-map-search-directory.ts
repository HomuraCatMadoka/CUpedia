import officialFacilities from "../../docs/campus-map/data/official-facilities-2026-09-07.json";
import { projectCampusMapBrowse } from "@/lib/campus-map/browse-projection";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";

export const YIA_BUILDING_ID = "545893b6-b89b-5067-aba0-c86518aa8fa8";
export const YIA_FLOOR_FOUR_ID = "fca22b9b-3675-5485-8ffc-7d3c70330976";

/** Uses the reviewed RES room/floor facts, with deliberately shuffled rows. */
export function createCampusMapSearchDirectoryFixture() {
  const entries = officialFacilities.entries.filter(
    (entry) => entry.fact?.buildingId === YIA_BUILDING_ID,
  );
  const floors = [
    ...new Map(
      entries.flatMap((entry) =>
        entry.fact?.floorId && entry.extracted.sourceFloor
          ? [
              [
                entry.fact.floorId,
                {
                  floorId: entry.fact.floorId,
                  displayLabel: entry.extracted.sourceFloor.replace(
                    /\/F$/u,
                    "",
                  ),
                  sortOrder:
                    entry.extracted.sourceFloor === "G/F"
                      ? 0
                      : Number.parseInt(entry.extracted.sourceFloor),
                },
              ] as const,
            ]
          : [],
      ),
    ).values(),
  ];
  const building = {
    buildingId: YIA_BUILDING_ID,
    name: "康本国际学术园",
    englishName: "Yasumoto International Academic Park",
    code: "C39a",
    aliases: ["YIA", "康本國際學術園"],
    anchor: { longitude: 114.2102, latitude: 22.4165, crs: "wgs84" as const },
    floors: floors.reverse(),
  };
  const places = entries.map((entry, index): CampusMapCurrentPlace => {
    const fact = entry.fact!;
    const floor = floors.find((floor) => floor.floorId === fact.floorId);
    return {
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      revisionId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      factSchemaVersion: 2,
      name: fact.name,
      placeType: fact.placeType as CampusMapCurrentPlace["placeType"],
      regularHours: null,
      officialActions: fact.officialActions,
      visitNote: fact.visitNote,
      capabilities: [],
      gender: null,
      wheelchairAccess: null,
      observedAt: null,
      verifiedAt: null,
      publishedAt: new Date("2026-09-07T00:00:00Z"),
      provenance: [],
      location: floor
        ? {
            kind: "floor",
            building: {
              id: building.buildingId,
              name: building.name,
              englishName: building.englishName,
              code: building.code,
            },
            floor: {
              id: floor.floorId,
              displayLabel: floor.displayLabel,
              sortOrder: floor.sortOrder,
            },
          }
        : {
            kind: "building",
            building: {
              id: building.buildingId,
              name: building.name,
              englishName: building.englishName,
              code: building.code,
            },
          },
    };
  });
  return projectCampusMapBrowse({
    buildings: [building],
    places: places.reverse(),
  });
}
