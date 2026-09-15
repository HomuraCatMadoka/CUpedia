import type { CampusMapBrowseBuilding } from "@/lib/campus-map/browse-projection";

const nameOrder = new Intl.Collator("zh-Hans", { numeric: true });

/** Numeric runs sort as room numbers; names and stable IDs break ties. */
export function compareCampusMapNames(
  left: { name: string; id: string },
  right: { name: string; id: string },
) {
  return (
    nameOrder.compare(left.name, right.name) ||
    (left.name < right.name ? -1 : left.name > right.name ? 1 : 0) ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

export function orderedCampusMapFloors(
  floors: CampusMapBrowseBuilding["floors"],
) {
  return [...floors].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      compareCampusMapNames(
        { name: left.displayLabel, id: left.floorId },
        { name: right.displayLabel, id: right.floorId },
      ),
  );
}
