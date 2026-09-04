import {
  CAMPUS_MAP_DEFAULT_VIEW_CENTER,
  type CampusMapBrowseMarker,
  type CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import {
  asWgs84Position,
  projectCampusMapWgs84ToAmap,
  type CampusMapAmapPosition,
} from "@/lib/campus-map/amap-position";
import type { CampusMapAmapCoordinateRequest } from "@/lib/campus-map/amap-coordinate-resolver";

interface CampusMapAmapProjectionDemand {
  selectedBuildingId: string | null;
  visibleAmenity: CampusMapBrowseMarker["pinType"] | null;
  selectedPlaceId: string | null;
  allBuildings?: boolean;
}

interface CampusMapAmapCoordinateProjection {
  center: CampusMapAmapPosition;
  positions: Readonly<Record<string, CampusMapAmapPosition>>;
  providerRequests: readonly CampusMapAmapCoordinateRequest[];
}

export function campusMapAmapBuildingPositionKey(buildingId: string) {
  return `building:${buildingId}`;
}

export function campusMapAmapPlacePositionKey(placeId: string) {
  return `place:${placeId}`;
}

export function campusMapAmapCoordinateProjectionSignature(
  projection: CampusMapAmapCoordinateProjection,
) {
  const positions = Object.entries(projection.positions).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const providerRequests = [...projection.providerRequests]
    .map(({ key, position }) => [key, position[0], position[1]] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([projection.center, positions, providerRequests]);
}

/**
 * Locally projects presentation coordinates. Canonical WGS84 assertions remain
 * inside the provider-neutral browse projection and no provider request is made.
 */
export function projectCampusMapBrowseToAmap(
  projection: CampusMapBrowseProjection,
  demand: CampusMapAmapProjectionDemand = {
    selectedBuildingId: null,
    visibleAmenity: null,
    selectedPlaceId: null,
  },
): CampusMapAmapCoordinateProjection {
  const positions: Record<string, CampusMapAmapPosition> = {};
  const providerRequests: CampusMapAmapCoordinateRequest[] = [];
  const visibleMarkers = projection.markers.filter(
    (marker) =>
      demand.visibleAmenity !== null &&
      marker.pinType === demand.visibleAmenity &&
      (demand.selectedPlaceId === null ||
        (marker.kind === "place"
          ? marker.placeId === demand.selectedPlaceId
          : marker.placeIds.includes(demand.selectedPlaceId))),
  );
  const visibleBuildingIds = new Set(
    visibleMarkers.flatMap((marker) =>
      marker.kind === "building-presence" ? [marker.buildingId] : [],
    ),
  );
  if (demand.selectedBuildingId) {
    visibleBuildingIds.add(demand.selectedBuildingId);
  }

  for (const building of projection.buildings) {
    if (!building.anchor) continue;
    if (!demand.allBuildings && !visibleBuildingIds.has(building.buildingId)) {
      continue;
    }
    const key = campusMapAmapBuildingPositionKey(building.buildingId);
    const position = asWgs84Position([
      building.anchor.longitude,
      building.anchor.latitude,
    ]);
    const local = projectCampusMapWgs84ToAmap(position, "approximate");
    if (local.status === "projected") {
      positions[key] = local.position;
    } else {
      providerRequests.push({ key, position });
    }
  }

  for (const marker of visibleMarkers) {
    if (marker.kind !== "place") continue;
    const key = campusMapAmapPlacePositionKey(marker.placeId);
    const position = asWgs84Position([
      marker.position.longitude,
      marker.position.latitude,
    ]);
    const local = projectCampusMapWgs84ToAmap(
      position,
      marker.position.precision,
    );
    if (local.status === "projected") positions[key] = local.position;
    else providerRequests.push({ key, position });
  }

  const center = projectCampusMapWgs84ToAmap(
    asWgs84Position(CAMPUS_MAP_DEFAULT_VIEW_CENTER),
    "approximate",
  );
  if (center.status !== "projected") {
    throw new Error("Campus Map default center is outside AMap calibration");
  }
  return {
    center: center.position,
    positions,
    providerRequests,
  };
}
