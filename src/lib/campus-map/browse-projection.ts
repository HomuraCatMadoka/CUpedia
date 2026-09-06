import type {
  CampusMapCurrentPlace,
  CampusMapCurrentPlaceLocation,
} from "@/lib/campus-map/fact-store";
import { isCampusMapPublicPlaceType } from "@/lib/campus-map/controlled-values";
import type { CampusMapPublicPlaceType } from "@/lib/campus-map/place-type-contract";

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
  placeType: CampusMapPublicPlaceType;
  regularHours: CampusMapCurrentPlace["regularHours"];
  officialActions: CampusMapCurrentPlace["officialActions"];
  visitNote: CampusMapCurrentPlace["visitNote"];
  capabilities: CampusMapCurrentPlace["capabilities"];
  gender: CampusMapCurrentPlace["gender"];
  wheelchairAccess: CampusMapCurrentPlace["wheelchairAccess"];
  buildingId: string | null;
  floorId: string | null;
  floorLabel: string | null;
  location: CampusMapCurrentPlaceLocation;
  observedAt: string | null;
  verifiedAt: string | null;
  publishedAt: string;
  provenance: ReadonlyArray<{
    kind: CampusMapCurrentPlace["provenance"][number]["kind"];
    accessedOn: string;
    observedAt: string | null;
    hasLocationEvidence: boolean;
  }>;
  selectionTarget: {
    kind: "place";
    placeId: string;
    buildingId: string | null;
    floorId: string | null;
  };
}

export interface CampusMapBrowsePresence {
  buildingId: string;
  placeType: CampusMapPublicPlaceType;
  placeIds: readonly string[];
  floorIds: readonly string[];
}

export type CampusMapBrowseMarker =
  | {
      kind: "building-presence";
      buildingId: string;
      placeType: CampusMapPublicPlaceType;
      placeIds: readonly string[];
      position: NonNullable<CampusMapBrowseBuildingSource["anchor"]>;
    }
  | {
      kind: "place";
      placeId: string;
      placeType: CampusMapPublicPlaceType;
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

function searchParts(value: string) {
  return value.trim().split(/\s+/u).map(normalizedSearchTerm).filter(Boolean);
}

function matchesSearchParts(
  parts: readonly string[],
  values: readonly (string | null | undefined)[],
) {
  return parts.every((part) =>
    values.some((value) =>
      value ? normalizedSearchTerm(value).includes(part) : false,
    ),
  );
}

function buildingSearchValues(building: CampusMapBrowseBuildingSource) {
  return [
    building.name,
    building.englishName,
    building.code,
    ...building.aliases,
  ];
}

function isExactPlaceName(query: string, name: string) {
  const normalizedQuery = normalizedSearchTerm(query);
  if (!normalizedQuery) return false;
  const variants = [name, ...name.split(/[()（）]/u)]
    .map((value) => normalizedSearchTerm(value))
    .filter(Boolean);
  return variants.some((variant) => variant === normalizedQuery);
}

const CLASSROOM_QUERY_PATTERN =
  /教室|课室|課室|classroom|lecture\s*(?:theatre|room)|\blt\d*\b|\b(?:room|rm)\s*[a-z]*\d+\b/iu;
const CLASSROOM_ROOM_SUFFIX_PATTERN =
  /^(?:lt\d*|(?:room|rm)?[a-z]{0,3}\d{1,4}[a-z]?)$/iu;

function matchesClassroomBuildingFallback(
  query: string,
  building: CampusMapBrowseBuildingSource,
) {
  const normalizedQuery = normalizedSearchTerm(query);
  if (!normalizedQuery) return false;
  const buildingTerms = buildingSearchValues(building)
    .flatMap((value) => (value ? [normalizedSearchTerm(value)] : []))
    .filter((value) => value.length >= 2)
    .sort((left, right) => right.length - left.length);

  return buildingTerms.some((term) => {
    const index = normalizedQuery.indexOf(term);
    if (index < 0) return false;
    const remainder = `${normalizedQuery.slice(0, index)}${normalizedQuery.slice(
      index + term.length,
    )}`;
    if (!remainder) return false;
    return (
      CLASSROOM_QUERY_PATTERN.test(query) ||
      CLASSROOM_ROOM_SUFFIX_PATTERN.test(remainder)
    );
  });
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
    placeType?: CampusMapPublicPlaceType;
    placeMatch?: "all" | "name";
  } = {},
): CampusMapBrowseResults {
  const queryParts = searchParts(filters.query ?? "");
  const buildingById = new Map(
    projection.buildings.map((building) => [building.buildingId, building]),
  );
  const places = projection.places.filter((place) => {
    if (filters.placeType && place.placeType !== filters.placeType) {
      return false;
    }
    const building = place.buildingId
      ? buildingById.get(place.buildingId)
      : undefined;
    if (
      !matchesSearchParts(queryParts, [
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
    if (filters.placeType) return false;
    return matchesSearchParts(queryParts, buildingSearchValues(building));
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

/**
 * Produces the user-facing search order without turning a parent Building into
 * a Place. Exact Place names come first; a classroom-like query may fall back
 * to a sourced Building name/code while staying explicitly labelled as such.
 */
export function searchCampusMapBrowse(
  projection: CampusMapBrowseProjection,
  query: string,
) {
  const trimmedQuery = query.trim();
  const parts = searchParts(trimmedQuery);
  if (parts.length === 0) return [];

  const buildingById = new Map(
    projection.buildings.map((building) => [building.buildingId, building]),
  );
  const places = queryCampusMapBrowse(projection, {
    query: trimmedQuery,
    placeMatch: "name",
  }).places;
  const placeResults = places
    .map((place) => ({
      kind: "place" as const,
      match: isExactPlaceName(trimmedQuery, place.name)
        ? ("exact-name" as const)
        : ("name" as const),
      place,
      building: place.buildingId
        ? (buildingById.get(place.buildingId) ?? null)
        : null,
    }))
    .sort(
      (left, right) =>
        Number(right.match === "exact-name") -
        Number(left.match === "exact-name"),
    );
  const matchedClassroomBuildingIds = new Set(
    places.flatMap((place) =>
      place.placeType === "classroom" && place.buildingId
        ? [place.buildingId]
        : [],
    ),
  );

  const buildingResults = projection.buildings.flatMap((building) => {
    const directMatch = matchesSearchParts(
      parts,
      buildingSearchValues(building),
    );
    const classroomFallback =
      !matchedClassroomBuildingIds.has(building.buildingId) &&
      matchesClassroomBuildingFallback(trimmedQuery, building);
    if (!directMatch && !classroomFallback) return [];
    return [
      {
        kind: "building" as const,
        match: classroomFallback
          ? ("classroom-fallback" as const)
          : ("building" as const),
        building,
      },
    ];
  });

  return [...placeResults, ...buildingResults];
}

export function queryCampusMapNearby(
  projection: CampusMapBrowseProjection,
  origin: {
    longitude: number;
    latitude: number;
    maxDistanceMeters?: number;
    placeType?: CampusMapPublicPlaceType;
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
      if (origin.placeType && place.placeType !== origin.placeType) return [];
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
      if (!isCampusMapPublicPlaceType(place.placeType)) return [];
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
          placeType: place.placeType,
          regularHours: place.regularHours,
          officialActions: place.officialActions,
          visitNote: place.visitNote,
          capabilities: place.capabilities,
          gender: place.gender,
          wheelchairAccess: place.wheelchairAccess,
          buildingId,
          floorId,
          floorLabel,
          location: place.location,
          observedAt: place.observedAt?.toISOString() ?? null,
          verifiedAt: place.verifiedAt?.toISOString() ?? null,
          publishedAt: place.publishedAt.toISOString(),
          provenance: place.provenance.map((source) => ({
            kind: source.kind,
            accessedOn: source.accessedOn,
            observedAt: source.observedAt?.toISOString() ?? null,
            hasLocationEvidence: source.hasLocationEvidence,
          })),
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
      placeType: CampusMapPublicPlaceType;
      placeIds: string[];
      floorIds: string[];
    }
  >();
  for (const place of places) {
    if (!place.buildingId) continue;
    const buildingPlaceIds = placeIdsByBuilding.get(place.buildingId) ?? [];
    buildingPlaceIds.push(place.placeId);
    placeIdsByBuilding.set(place.buildingId, buildingPlaceIds);

    const key = `${place.buildingId}:${place.placeType}`;
    const presence = presenceByKey.get(key) ?? {
      buildingId: place.buildingId,
      placeType: place.placeType,
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
              placeType: presence.placeType,
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
            placeType: place.placeType,
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
