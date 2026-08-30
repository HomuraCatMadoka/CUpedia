import type {
  CampusMapBrowseBuilding,
  CampusMapBrowsePlace,
} from "@/lib/campus-map/browse-projection";
import type { CampusMapBrowseProjectionSnapshot } from "@/lib/campus-map/browse-projection-store";

export type CampusMapBuildingDirectory = {
  status: "loading" | "empty" | "ready" | "error";
  building: CampusMapBrowseBuilding | null;
  places: readonly CampusMapBrowsePlace[];
};

/** Projects one Building card without becoming another data or selection owner. */
export function projectCampusMapBuildingDirectory(
  snapshot: CampusMapBrowseProjectionSnapshot,
  buildingId: string,
  floorId: string | null,
): CampusMapBuildingDirectory {
  const building =
    snapshot.projection.buildings.find(
      (candidate) => candidate.buildingId === buildingId,
    ) ?? null;
  if (!building) return { status: "error", building: null, places: [] };

  const places = snapshot.projection.places.filter(
    (place) =>
      place.buildingId === buildingId &&
      (floorId === null || place.floorId === floorId),
  );
  if (snapshot.status === "refreshing") {
    return { status: "loading", building, places };
  }
  if (snapshot.status === "error") {
    return { status: "error", building, places };
  }
  return {
    status: places.length === 0 ? "empty" : "ready",
    building,
    places,
  };
}
