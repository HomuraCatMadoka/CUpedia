import {
  AMAP_PROTOTYPE_BUILDINGS,
  AMAP_PROTOTYPE_FACILITIES,
} from "@/lib/campus-map/amap-prototype-catalog";
import {
  projectCampusMapBrowse,
  type CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";

/**
 * Keeps the old prototype scenarios available to component tests without
 * making the production map read the prototype catalogue at runtime.
 */
export function createAmapPrototypeBrowseFixture(): CampusMapBrowseProjection {
  const buildingById = new Map(
    AMAP_PROTOTYPE_BUILDINGS.map((building) => [building.id, building]),
  );
  const places: CampusMapCurrentPlace[] = AMAP_PROTOTYPE_FACILITIES.flatMap(
    (facility) => {
      const building = buildingById.get(facility.buildingId);
      if (!building) return [];
      const audience =
        facility.access === "公众可达" ? "public" : "cuhk-member";
      return [
        {
          id: facility.id,
          revisionId: facility.id.replace("71000000", "72000000"),
          factSchemaVersion: 1,
          name: facility.name,
          pinType: facility.category,
          capabilities: [],
          access: {
            audience,
            credentialRequirement:
              audience === "public" ? "none" : "campus-card",
            schedule: { kind: "unknown" },
            reservationRequirement: "none",
            temporaryStatus: "normal",
          },
          facets: {
            gender: "unknown",
            wheelchairAccess: "unknown",
          },
          location: {
            kind: "floor",
            building: {
              id: building.id,
              name: building.name,
              englishName: building.englishName,
              code: building.code,
            },
            floor: {
              id: facility.floorId,
              displayLabel: `${facility.floorId}/F`,
              sortOrder: building.floorIds.indexOf(facility.floorId),
            },
          },
          observedAt: null,
          verifiedAt: null,
          publishedAt: new Date("2026-08-14T00:00:00.000Z"),
          provenance: [],
        } satisfies CampusMapCurrentPlace,
      ];
    },
  );

  return projectCampusMapBrowse({
    buildings: AMAP_PROTOTYPE_BUILDINGS.map((building) => ({
      buildingId: building.id,
      name: building.name,
      englishName: building.englishName,
      code: building.code,
      aliases: building.aliases,
      anchor: {
        longitude: building.position[0],
        latitude: building.position[1],
        crs: "wgs84" as const,
      },
      floors: building.floorIds.map((floorId, sortOrder) => ({
        floorId,
        displayLabel: `${floorId}/F`,
        sortOrder,
      })),
    })),
    places,
  });
}
