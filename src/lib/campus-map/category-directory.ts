import type {
  CampusMapBrowseBuilding,
  CampusMapBrowsePlace,
} from "@/lib/campus-map/browse-projection";
import { compareCampusMapNames } from "@/lib/campus-map/browse-order";

export const CAMPUS_MAP_CATEGORY_PREVIEW_LIMIT = 8;

export interface CampusMapClassroomGroup {
  buildingId: string | null;
  building: CampusMapBrowseBuilding | null;
  places: CampusMapBrowsePlace[];
}

function compareRooms(left: CampusMapBrowsePlace, right: CampusMapBrowsePlace) {
  const leftFloor = left.location.kind === "floor" ? left.location.floor : null;
  const rightFloor =
    right.location.kind === "floor" ? right.location.floor : null;
  if (leftFloor && !rightFloor) return -1;
  if (!leftFloor && rightFloor) return 1;
  if (leftFloor && rightFloor) {
    const floorOrder =
      leftFloor.sortOrder - rightFloor.sortOrder ||
      compareCampusMapNames(
        { name: leftFloor.displayLabel, id: leftFloor.id },
        { name: rightFloor.displayLabel, id: rightFloor.id },
      );
    if (floorOrder) return floorOrder;
  }
  return compareCampusMapNames(
    { name: left.name, id: left.placeId },
    { name: right.name, id: right.placeId },
  );
}

/** A presentation of visible facts; missing Floors never come from room numbers. */
export function groupCampusMapClassrooms(
  places: readonly CampusMapBrowsePlace[],
  buildings: ReadonlyMap<string, CampusMapBrowseBuilding>,
): CampusMapClassroomGroup[] {
  const groups = new Map<string | null, CampusMapClassroomGroup>();
  for (const place of places) {
    const group = groups.get(place.buildingId) ?? {
      buildingId: place.buildingId,
      building: place.buildingId
        ? (buildings.get(place.buildingId) ?? null)
        : null,
      places: [],
    };
    group.places.push(place);
    groups.set(place.buildingId, group);
  }
  return [...groups.values()]
    .sort((left, right) => {
      if (left.building && !right.building) return -1;
      if (!left.building && right.building) return 1;
      const key = (group: CampusMapClassroomGroup) =>
        group.building?.code ??
        group.building?.englishName ??
        group.building?.name ??
        "";
      return compareCampusMapNames(
        { name: key(left), id: left.buildingId ?? "" },
        { name: key(right), id: right.buildingId ?? "" },
      );
    })
    .map((group) => ({
      ...group,
      places: group.places.toSorted(compareRooms),
    }));
}
