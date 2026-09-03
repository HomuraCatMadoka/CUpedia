import {
  CAMPUS_MAP_DEFAULT_VIEW_CENTER,
  type CampusMapBrowseMarker,
  type CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import {
  asAmapPosition,
  asWgs84Position,
  projectCampusMapWgs84ToAmap,
  type CampusMapAmapPosition,
} from "@/lib/campus-map/amap-position";
import type { CampusMapAmapCoordinateRequest } from "@/lib/campus-map/amap-coordinate-resolver";
import type { CampusMapSelectionTarget } from "@/lib/campus-map/fact-store";

interface CampusMapAmapProjectionDemand {
  visibleAmenity: CampusMapBrowseMarker["pinType"] | null;
  selectedBuildingId: string | null;
  selectedPlaceId: string | null;
  allBuildings?: boolean;
}

interface CampusMapAmapCoordinateProjection {
  center: CampusMapAmapPosition;
  positions: Readonly<Record<string, CampusMapAmapPosition>>;
  providerRequests: readonly CampusMapAmapCoordinateRequest[];
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

export interface CampusMapAmapPoiInput {
  providerObjectId: string | null;
  name: string;
  /** AMap emits GCJ-02 coordinates at this adapter boundary. */
  position: CampusMapAmapPosition;
}

type CampusMapAmapPoiCard =
  | {
      kind: "linked";
      title: string;
      selectionTarget: CampusMapSelectionTarget;
    }
  | {
      kind: "transient";
      externalId: string;
      title: string;
      position: CampusMapAmapPosition;
    };

function isValidPosition(position: CampusMapAmapPosition) {
  return (
    Number.isFinite(position[0]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    Number.isFinite(position[1]) &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

/**
 * Locally projects presentation coordinates. Canonical WGS84 assertions remain
 * inside the provider-neutral browse projection and no provider request is made.
 */
export function projectCampusMapBrowseToAmap(
  projection: CampusMapBrowseProjection,
  demand: CampusMapAmapProjectionDemand = {
    visibleAmenity: null,
    selectedBuildingId: null,
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

  for (const building of projection.buildings) {
    if (!building.anchor) continue;
    if (
      !demand.allBuildings &&
      demand.selectedBuildingId !== building.buildingId &&
      !visibleBuildingIds.has(building.buildingId)
    ) {
      continue;
    }
    const key = `building:${building.buildingId}`;
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
    const key = `place:${marker.placeId}`;
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

function createTransientCampusMapAmapPoiCard(
  input: CampusMapAmapPoiInput,
): CampusMapAmapPoiCard | null {
  if (!isValidPosition(input.position)) return null;
  const providerObjectId = input.providerObjectId?.trim() || null;
  return {
    kind: "transient",
    externalId: providerObjectId ?? `${input.position[0]},${input.position[1]}`,
    title: input.name.trim() || "高德地图地点",
    position: asAmapPosition([input.position[0], input.position[1]]),
  };
}

/**
 * Builds the only AMap POI card model. A provider mapping is accepted only
 * when its canonical target is present in the same public Current projection.
 */
export function projectCampusMapAmapPoiCard(
  projection: CampusMapBrowseProjection,
  input: CampusMapAmapPoiInput,
  mapping: CampusMapSelectionTarget | null,
): CampusMapAmapPoiCard | null {
  if (mapping?.kind === "building") {
    const building = projection.buildings.find(
      (candidate) => candidate.buildingId === mapping.buildingId,
    );
    if (building) {
      return {
        kind: "linked",
        title: building.name,
        selectionTarget: building.selectionTarget,
      };
    }
  } else if (mapping?.kind === "place") {
    const place = projection.places.find(
      (candidate) => candidate.placeId === mapping.placeId,
    );
    if (place) {
      return {
        kind: "linked",
        title: place.name,
        selectionTarget: place.selectionTarget,
      };
    }
  }
  return createTransientCampusMapAmapPoiCard(input);
}

export class CampusMapAmapPoiCardResolver {
  private revision = 0;

  constructor(
    private readonly loadCard: (
      input: CampusMapAmapPoiInput,
    ) => Promise<CampusMapAmapPoiCard | null>,
  ) {}

  invalidate() {
    this.revision += 1;
  }

  async resolveLatest(
    input: CampusMapAmapPoiInput,
  ): Promise<
    | { status: "resolved"; card: CampusMapAmapPoiCard | null }
    | { status: "superseded" }
  > {
    const revision = ++this.revision;
    let card: CampusMapAmapPoiCard | null;
    try {
      card = await this.loadCard(input);
    } catch {
      card = createTransientCampusMapAmapPoiCard(input);
    }
    return revision === this.revision
      ? { status: "resolved", card }
      : { status: "superseded" };
  }
}
