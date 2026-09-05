import type {
  CampusMapCurrentPlace,
  CampusMapCurrentPlaceLocation,
} from "@/lib/campus-map/fact-store";
import type {
  CampusMapAccessSchedule,
  CampusMapAudience,
  CampusMapCredentialRequirement,
  CampusMapGender,
  CampusMapPinType,
  CampusMapReservationRequirement,
  CampusMapTemporaryStatus,
  CampusMapWheelchairAccess,
} from "@/db/schema";
import { projectCampusMapLegacyV2Presentation } from "@/lib/campus-map/legacy-place-ui-adapter";

type CampusMapLegacyAccess = {
  audience: CampusMapAudience;
  credentialRequirement: CampusMapCredentialRequirement;
  schedule: CampusMapAccessSchedule;
  reservationRequirement: CampusMapReservationRequirement;
  temporaryStatus: CampusMapTemporaryStatus;
};

/** Product viewport default, not a Building or Place assertion. */
export const CAMPUS_MAP_DEFAULT_VIEW_CENTER = [114.2072, 22.4191] as const;

export interface CampusMapBrowseBuildingSource {
  buildingId: string;
  name: string;
  englishName: string | null;
  code: string | null;
  aliases: readonly string[];
  anchor: {
    longitude: number;
    latitude: number;
    crs: "wgs84";
  } | null;
  floors: ReadonlyArray<{
    floorId: string;
    displayLabel: string;
    sortOrder: number;
  }>;
}

export interface CampusMapBrowseProjection {
  buildings: readonly CampusMapBrowseBuilding[];
  places: readonly CampusMapBrowsePlace[];
  presences: readonly CampusMapBrowsePresence[];
  markers: readonly CampusMapBrowseMarker[];
}

export const EMPTY_CAMPUS_MAP_BROWSE_PROJECTION: CampusMapBrowseProjection = {
  buildings: [],
  places: [],
  presences: [],
  markers: [],
};

export interface CampusMapBrowseBuilding extends CampusMapBrowseBuildingSource {
  placeIds: readonly string[];
  selectionTarget: { kind: "building"; buildingId: string };
}

export interface CampusMapBrowsePlace {
  placeId: string;
  revisionId: string;
  name: string;
  /** Temporary adapter for the unchanged V1 map UI. */
  pinType: CampusMapPinType;
  capabilities: CampusMapCurrentPlace["capabilities"];
  access: CampusMapLegacyAccess;
  facets: {
    gender: CampusMapGender;
    wheelchairAccess: CampusMapWheelchairAccess;
  };
  buildingId: string | null;
  floorId: string | null;
  floorLabel: string | null;
  location: CampusMapCurrentPlaceLocation;
  publishedAt: string;
  selectionTarget: {
    kind: "place";
    placeId: string;
    buildingId: string | null;
    floorId: string | null;
  };
}

export interface CampusMapBrowsePresence {
  buildingId: string;
  pinType: CampusMapPinType;
  placeIds: readonly string[];
  floorIds: readonly string[];
}

export type CampusMapBrowseMarker =
  | {
      kind: "building-presence";
      buildingId: string;
      pinType: CampusMapPinType;
      placeIds: readonly string[];
      position: NonNullable<CampusMapBrowseBuildingSource["anchor"]>;
    }
  | {
      kind: "place";
      placeId: string;
      pinType: CampusMapPinType;
      position: Extract<
        CampusMapCurrentPlaceLocation,
        { kind: "outdoor-point" }
      >["point"];
    };

export interface CampusMapBrowseResults {
  buildings: readonly CampusMapBrowseBuilding[];
  places: readonly CampusMapBrowsePlace[];
  counts: {
    buildings: number;
    locations: number;
    equipment: "unknown";
  };
}

export interface CampusMapBrowseNearbyResults {
  places: ReadonlyArray<{
    place: CampusMapBrowsePlace;
    distanceMeters: number;
    distanceEvidence: "place-point" | "building-anchor";
  }>;
  counts: CampusMapBrowseResults["counts"];
}

export interface CampusMapBrowseSource {
  listBuildings(): Promise<readonly CampusMapBrowseBuildingSource[]>;
  listCurrentPlaces(filters: {
    afterPlaceId?: string;
    limit: number;
  }): Promise<{
    items: readonly CampusMapCurrentPlace[];
    nextCursor: string | null;
  }>;
}

export async function readCampusMapBrowse(
  source: CampusMapBrowseSource,
): Promise<CampusMapBrowseProjection> {
  const buildingsPromise = source.listBuildings();
  const places: CampusMapCurrentPlace[] = [];
  const seenCursors = new Set<string>();
  let afterPlaceId: string | undefined;
  do {
    const page = await source.listCurrentPlaces({ afterPlaceId, limit: 100 });
    places.push(...page.items);
    if (page.nextCursor === null) break;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error("Campus Map Current fact pagination did not advance");
    }
    seenCursors.add(page.nextCursor);
    afterPlaceId = page.nextCursor;
  } while (true);

  return projectCampusMapBrowse({
    buildings: await buildingsPromise,
    places,
  });
}

function normalizedSearchTerm(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isValidWgs84Point(value: {
  longitude: number;
  latitude: number;
  crs: "wgs84";
}) {
  return (
    value.crs === "wgs84" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90
  );
}

function isValidCurrentPlace(place: CampusMapCurrentPlace) {
  if (
    !place.id.trim() ||
    !place.revisionId.trim() ||
    !place.name.trim() ||
    !(place.publishedAt instanceof Date) ||
    !Number.isFinite(place.publishedAt.getTime())
  ) {
    return false;
  }
  if (place.location.kind === "building") {
    return Boolean(place.location.building.id.trim());
  }
  if (place.location.kind === "floor") {
    return Boolean(
      place.location.building.id.trim() &&
      place.location.floor.id.trim() &&
      place.location.floor.displayLabel.trim(),
    );
  }
  return (
    isValidWgs84Point(place.location.point) &&
    (place.location.point.precision === "approximate" ||
      place.location.point.precision === "precise")
  );
}

function distanceMeters(
  first: { longitude: number; latitude: number },
  second: { longitude: number; latitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function queryCampusMapBrowse(
  projection: CampusMapBrowseProjection,
  filters: {
    query?: string;
    pinType?: CampusMapPinType;
    placeMatch?: "all" | "name";
  } = {},
): CampusMapBrowseResults {
  const queryParts = (filters.query ?? "")
    .trim()
    .split(/\s+/u)
    .map(normalizedSearchTerm)
    .filter(Boolean);
  const buildingById = new Map(
    projection.buildings.map((building) => [building.buildingId, building]),
  );
  const matchesQuery = (values: Array<string | null>) =>
    queryParts.every((part) =>
      values.some((value) =>
        value ? normalizedSearchTerm(value).includes(part) : false,
      ),
    );
  const places = projection.places.filter((place) => {
    if (filters.pinType && place.pinType !== filters.pinType) return false;
    const building = place.buildingId
      ? buildingById.get(place.buildingId)
      : undefined;
    if (
      !matchesQuery([
        place.name,
        place.floorLabel,
        building?.name ?? null,
        building?.englishName ?? null,
        building?.code ?? null,
        ...(building?.aliases ?? []),
      ])
    ) {
      return false;
    }
    return filters.placeMatch === "name"
      ? queryParts.some((part) =>
          normalizedSearchTerm(place.name).includes(part),
        )
      : true;
  });
  const matchingBuildingIds = new Set(
    places.flatMap((place) => (place.buildingId ? [place.buildingId] : [])),
  );
  const buildings = projection.buildings.filter((building) => {
    if (matchingBuildingIds.has(building.buildingId)) return true;
    if (filters.pinType) return false;
    return matchesQuery([
      building.name,
      building.englishName,
      building.code,
      ...building.aliases,
    ]);
  });

  return {
    buildings,
    places,
    counts: {
      buildings: buildings.length,
      locations: places.length,
      equipment: "unknown",
    },
  };
}

export function queryCampusMapNearby(
  projection: CampusMapBrowseProjection,
  origin: {
    longitude: number;
    latitude: number;
    maxDistanceMeters?: number;
    pinType?: CampusMapPinType;
  },
): CampusMapBrowseNearbyResults {
  if (
    !isValidWgs84Point({ ...origin, crs: "wgs84" }) ||
    (origin.maxDistanceMeters !== undefined &&
      (!Number.isFinite(origin.maxDistanceMeters) ||
        origin.maxDistanceMeters < 0))
  ) {
    return {
      places: [],
      counts: { buildings: 0, locations: 0, equipment: "unknown" },
    };
  }
  const buildingById = new Map(
    projection.buildings.map((building) => [building.buildingId, building]),
  );
  const maxDistance = origin.maxDistanceMeters ?? Number.POSITIVE_INFINITY;
  const places = projection.places
    .flatMap((place, index) => {
      if (origin.pinType && place.pinType !== origin.pinType) return [];
      const point =
        place.location.kind === "outdoor-point"
          ? place.location.point
          : place.buildingId
            ? buildingById.get(place.buildingId)?.anchor
            : null;
      if (!point) return [];
      const distance = distanceMeters(origin, point);
      if (distance > maxDistance) return [];
      return [
        {
          place,
          distanceMeters: distance,
          distanceEvidence:
            place.location.kind === "outdoor-point"
              ? ("place-point" as const)
              : ("building-anchor" as const),
          index,
        },
      ];
    })
    .sort(
      (first, second) =>
        first.distanceMeters - second.distanceMeters ||
        first.index - second.index,
    )
    .map(({ place, distanceMeters, distanceEvidence }) => ({
      place,
      distanceMeters,
      distanceEvidence,
    }));
  const buildingIds = new Set(
    places.flatMap(({ place }) => (place.buildingId ? [place.buildingId] : [])),
  );
  return {
    places,
    counts: {
      buildings: buildingIds.size,
      locations: places.length,
      equipment: "unknown",
    },
  };
}

export function projectCampusMapBrowse(input: {
  buildings: readonly CampusMapBrowseBuildingSource[];
  places: readonly CampusMapCurrentPlace[];
}): CampusMapBrowseProjection {
  const currentPlaceById = new Map<string, CampusMapCurrentPlace>();
  const duplicatePlaceIds = new Set<string>();
  for (const place of input.places) {
    if (!isValidCurrentPlace(place)) continue;
    if (currentPlaceById.has(place.id)) duplicatePlaceIds.add(place.id);
    else currentPlaceById.set(place.id, place);
  }
  for (const duplicatePlaceId of duplicatePlaceIds) {
    currentPlaceById.delete(duplicatePlaceId);
  }
  const places = [...currentPlaceById.values()].flatMap(
    (place): CampusMapBrowsePlace[] => {
      const presentation = projectCampusMapLegacyV2Presentation(place);
      if (!presentation) return [];
      const buildingId =
        place.location.kind === "building" || place.location.kind === "floor"
          ? place.location.building.id
          : null;
      const floorId =
        place.location.kind === "floor" ? place.location.floor.id : null;
      const floorLabel =
        place.location.kind === "floor"
          ? place.location.floor.displayLabel
          : null;
      return [
        {
          placeId: place.id,
          revisionId: place.revisionId,
          name: place.name,
          pinType: presentation.pinType,
          capabilities: presentation.capabilities,
          access: presentation.access,
          facets: presentation.facets,
          buildingId,
          floorId,
          floorLabel,
          location: place.location,
          publishedAt: place.publishedAt.toISOString(),
          selectionTarget: {
            kind: "place",
            placeId: place.id,
            buildingId,
            floorId,
          },
        },
      ];
    },
  );

  const placeIdsByBuilding = new Map<string, string[]>();
  const presenceByKey = new Map<
    string,
    {
      buildingId: string;
      pinType: CampusMapPinType;
      placeIds: string[];
      floorIds: string[];
    }
  >();
  for (const place of places) {
    if (!place.buildingId) continue;
    const buildingPlaceIds = placeIdsByBuilding.get(place.buildingId) ?? [];
    buildingPlaceIds.push(place.placeId);
    placeIdsByBuilding.set(place.buildingId, buildingPlaceIds);

    const key = `${place.buildingId}:${place.pinType}`;
    const presence = presenceByKey.get(key) ?? {
      buildingId: place.buildingId,
      pinType: place.pinType,
      placeIds: [],
      floorIds: [],
    };
    presence.placeIds.push(place.placeId);
    if (place.floorId && !presence.floorIds.includes(place.floorId)) {
      presence.floorIds.push(place.floorId);
    }
    presenceByKey.set(key, presence);
  }

  const buildings = input.buildings.map(
    (building): CampusMapBrowseBuilding => ({
      ...building,
      anchor:
        building.anchor && isValidWgs84Point(building.anchor)
          ? building.anchor
          : null,
      placeIds: placeIdsByBuilding.get(building.buildingId) ?? [],
      selectionTarget: {
        kind: "building",
        buildingId: building.buildingId,
      },
    }),
  );
  const buildingById = new Map(
    buildings.map((building) => [building.buildingId, building]),
  );
  const presences = [...presenceByKey.values()];
  const presenceMarkers: CampusMapBrowseMarker[] = presences.flatMap(
    (presence) => {
      const anchor = buildingById.get(presence.buildingId)?.anchor;
      return anchor
        ? [
            {
              kind: "building-presence",
              buildingId: presence.buildingId,
              pinType: presence.pinType,
              placeIds: presence.placeIds,
              position: anchor,
            },
          ]
        : [];
    },
  );
  const pointMarkers: CampusMapBrowseMarker[] = places.flatMap((place) =>
    place.location.kind === "outdoor-point"
      ? [
          {
            kind: "place",
            placeId: place.placeId,
            pinType: place.pinType,
            position: place.location.point,
          },
        ]
      : [],
  );

  return {
    buildings,
    places,
    presences,
    markers: [...presenceMarkers, ...pointMarkers],
  };
}
