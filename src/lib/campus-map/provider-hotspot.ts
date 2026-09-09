import type {
  CampusMapBrowseBuilding,
  CampusMapBrowsePlace,
  CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import type { CampusMapProviderMappingProjection } from "@/lib/campus-map/provider-mapping-domain";

export interface CampusMapProviderHotspotInput {
  providerObjectId: string | null;
  name: string;
}

export type CampusMapProviderHotspotResolution =
  | { kind: "building"; building: CampusMapBrowseBuilding }
  | { kind: "place"; place: CampusMapBrowsePlace }
  | {
      kind: "transient";
      name: string;
      providerObjectId: string | null;
    };

/**
 * Resolves one provider hotspot by exact provider object ID. Names are
 * presentation-only and never participate in canonical identity.
 */
export function resolveCampusMapProviderHotspot(
  projection: CampusMapBrowseProjection,
  mappings: readonly CampusMapProviderMappingProjection[],
  hotspot: CampusMapProviderHotspotInput,
): CampusMapProviderHotspotResolution {
  const mapping = hotspot.providerObjectId
    ? mappings.find(
        (candidate) => candidate.providerObjectId === hotspot.providerObjectId,
      )
    : null;
  if (mapping?.target.kind === "building") {
    const { buildingId } = mapping.target;
    const building = projection.buildings.find(
      (candidate) => candidate.buildingId === buildingId,
    );
    if (building) return { kind: "building", building };
  } else if (mapping?.target.kind === "place") {
    const { placeId } = mapping.target;
    const place = projection.places.find(
      (candidate) => candidate.placeId === placeId,
    );
    if (place) return { kind: "place", place };
  }

  return {
    kind: "transient",
    name: hotspot.name.trim() || "高德地图地点",
    providerObjectId: hotspot.providerObjectId,
  };
}

/** Suggestions require a separate user choice; they never establish a provider mapping. */
export function suggestCampusMapHotspotBuildings(
  buildings: readonly CampusMapBrowseBuilding[],
  name: string,
): CampusMapBrowseBuilding[] {
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
  const query = normalize(name);
  if (!query) return [];
  return buildings
    .filter((building) =>
      [building.name, building.englishName, ...building.aliases].some(
        (label) => {
          if (!label) return false;
          const candidate = normalize(label);
          return candidate.length >= 2 && candidate === query;
        },
      ),
    )
    .slice(0, 3);
}
