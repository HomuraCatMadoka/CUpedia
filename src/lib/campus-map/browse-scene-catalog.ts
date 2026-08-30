import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";
import type { CampusMapSceneCatalog } from "@/lib/campus-map/scene-kernel";

export function createCampusMapSceneCatalog(
  projection: CampusMapBrowseProjection,
  categories: readonly string[],
): CampusMapSceneCatalog {
  const buildingIdsWithCameraAnchor = new Set(
    projection.buildings.flatMap((building) =>
      building.anchor ? [building.buildingId] : [],
    ),
  );
  return {
    categories,
    buildings: Object.fromEntries(
      projection.buildings.map((building) => [
        building.buildingId,
        { floorIds: building.floors.map((floor) => floor.floorId) },
      ]),
    ),
    places: Object.fromEntries(
      projection.places.map((place) => [
        place.placeId,
        {
          buildingId: place.buildingId,
          floorId: place.floorId,
          category: place.pinType,
          cameraTarget:
            place.location.kind === "outdoor-point"
              ? "place-point"
              : place.buildingId &&
                  buildingIdsWithCameraAnchor.has(place.buildingId)
                ? "building-anchor"
                : null,
        },
      ]),
    ),
    contents: {},
  };
}

/** Keeps one shared runtime catalog object current across projection refreshes. */
export class RefreshableCampusMapSceneCatalog implements CampusMapSceneCatalog {
  categories: CampusMapSceneCatalog["categories"];
  buildings: CampusMapSceneCatalog["buildings"];
  places: CampusMapSceneCatalog["places"];
  contents: CampusMapSceneCatalog["contents"];

  constructor(initial: CampusMapSceneCatalog) {
    this.categories = initial.categories;
    this.buildings = initial.buildings;
    this.places = initial.places;
    this.contents = initial.contents;
  }

  replace(next: CampusMapSceneCatalog) {
    this.categories = next.categories;
    this.buildings = next.buildings;
    this.places = next.places;
    this.contents = next.contents;
  }
}
