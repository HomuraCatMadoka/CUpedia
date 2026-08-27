import type { CampusMapBrowseProjection } from "./browse-projection";
import type { CampusMapCatalog } from "./map-state";
import type { CampusMapSceneCatalog } from "./scene-kernel";

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
    facilities: Object.fromEntries(
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

/** Keeps the driver's single catalog object current after a publish refresh. */
export class RefreshableCampusMapSceneCatalog implements CampusMapSceneCatalog {
  categories: CampusMapSceneCatalog["categories"];
  buildings: CampusMapSceneCatalog["buildings"];
  facilities: CampusMapSceneCatalog["facilities"];
  contents: CampusMapSceneCatalog["contents"];

  constructor(initial: CampusMapSceneCatalog) {
    this.categories = initial.categories;
    this.buildings = initial.buildings;
    this.facilities = initial.facilities;
    this.contents = initial.contents;
  }

  replace(next: CampusMapSceneCatalog) {
    this.categories = next.categories;
    this.buildings = next.buildings;
    this.facilities = next.facilities;
    this.contents = next.contents;
  }
}

/** Compatibility adapter for legacy query-string parsing only. */
export function createLegacyCampusMapCatalog(
  catalog: CampusMapSceneCatalog,
): CampusMapCatalog {
  return {
    categories: catalog.categories,
    buildings: catalog.buildings,
    facilities: Object.fromEntries(
      Object.entries(catalog.facilities).flatMap(([placeId, place]) =>
        place?.buildingId && place.floorId
          ? [
              [
                placeId,
                {
                  buildingId: place.buildingId,
                  floorId: place.floorId,
                  category: place.category,
                },
              ],
            ]
          : [],
      ),
    ),
  };
}
