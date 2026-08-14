import {
  getCampusBusStopBoard,
  type CampusBusArrival,
  type CampusBusPassengerRoute,
  type CampusBusStopBoard,
  type LngLat,
} from "./campus-bus";

export type BoardingPlaceStopOccurrence = {
  patternIds: string[];
  routeCode: string;
  routeId: string;
  routeNameZhHant: string;
  routeSlug: string;
  routeSubtitle: string;
  stopId: string;
  stopOccurrenceId: string;
};

export type CampusBusBoardingPlace = {
  coordinates: LngLat | null;
  id: string;
  nameEn: string;
  nameZhHant: string;
  stopIds: string[];
  stopOccurrences: BoardingPlaceStopOccurrence[];
};

export type NearbyCampusBusBoardingPlace = {
  distanceMeters: number;
  place: CampusBusBoardingPlace;
};

const EARTH_RADIUS_METERS = 6_371_000;

export function campusBusDistanceInMeters(from: LngLat, to: LngLat) {
  const latitude1 = (from[1] * Math.PI) / 180;
  const latitude2 = (to[1] * Math.PI) / 180;
  const deltaLatitude = ((to[1] - from[1]) * Math.PI) / 180;
  const deltaLongitude = ((to[0] - from[0]) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function findNearbyCampusBusBoardingPlaces(
  places: CampusBusBoardingPlace[],
  queryLocation: LngLat,
  maximumDistanceMeters: number,
): NearbyCampusBusBoardingPlace[] {
  return places
    .flatMap((place) => {
      if (!place.coordinates) return [];
      const distanceMeters = campusBusDistanceInMeters(
        queryLocation,
        place.coordinates,
      );
      return distanceMeters <= maximumDistanceMeters
        ? [{ distanceMeters, place }]
        : [];
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

export function formatApproximateCampusBusDistance(distanceMeters: number) {
  return `約 ${Math.max(10, Math.round(distanceMeters / 10) * 10)} 米`;
}

export function getCampusBusPassengerRouteName(
  routeCode: string,
  routeNameZhHant: string,
) {
  const escapedCode = routeCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    routeNameZhHant.replace(new RegExp(`^${escapedCode}\\s*`, "i"), "") ||
    routeNameZhHant
  );
}

export type BoardingPlaceRouteBoard = BoardingPlaceStopOccurrence & {
  board: CampusBusStopBoard;
  nextArrival: CampusBusArrival | null;
  nextTimeKind: "arrival_projection" | "origin_departure" | null;
  repeatedStopIndex: number | null;
  repeatedStopTotal: number;
};

function comparePlaces(
  left: CampusBusBoardingPlace,
  right: CampusBusBoardingPlace,
) {
  return left.nameZhHant.localeCompare(right.nameZhHant, "zh-Hant-HK");
}

/**
 * Builds the passenger browsing index without inventing Stop–Place links.
 * The reviewed upstream stopId is the only currently available evidence that
 * occurrences across Routes refer to the same operational boarding point.
 * This provisional grouping intentionally does not claim that co-located but
 * distinct stopIds are one Boarding place.
 */
export function buildCampusBusBoardingPlaces(
  routes: CampusBusPassengerRoute[],
): CampusBusBoardingPlace[] {
  const places = new Map<string, CampusBusBoardingPlace>();

  for (const route of routes) {
    for (const stop of route.stops) {
      const id = `stop:${stop.stopId}`;
      const current = places.get(id) ?? {
        coordinates: null,
        id,
        nameEn: stop.nameEn,
        nameZhHant: stop.nameZhHant,
        stopIds: [stop.stopId],
        stopOccurrences: [],
      };
      const patternIds = route.patterns
        .filter((pattern) =>
          pattern.projections.some(
            (projection) => projection.stopOccurrenceId === stop.id,
          ),
        )
        .map((pattern) => pattern.id);

      current.coordinates ??= route.map.stopCoordinates[stop.id] ?? null;
      current.stopOccurrences.push({
        patternIds,
        routeCode: route.code,
        routeId: route.routeId,
        routeNameZhHant: getCampusBusPassengerRouteName(
          route.code,
          route.routeNameZhHant,
        ),
        routeSlug: route.slug,
        routeSubtitle: route.subtitle,
        stopId: stop.stopId,
        stopOccurrenceId: stop.id,
      });
      places.set(id, current);
    }
  }

  return [...places.values()].sort(comparePlaces);
}

export function filterCampusBusBoardingPlaces(
  places: CampusBusBoardingPlace[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hant-HK");
  if (!normalizedQuery) return places;

  return places.filter((place) =>
    `${place.nameZhHant} ${place.nameEn}`
      .toLocaleLowerCase("zh-Hant-HK")
      .includes(normalizedQuery),
  );
}

export function getCampusBusBoardingPlaceRouteBoards(
  place: CampusBusBoardingPlace,
  routes: CampusBusPassengerRoute[],
  now: number,
): BoardingPlaceRouteBoard[] {
  const routesById = new Map(routes.map((route) => [route.routeId, route]));
  const occurrenceCounts = new Map<string, number>();
  const occurrenceIndexes = new Map<string, number>();

  for (const occurrence of place.stopOccurrences) {
    occurrenceCounts.set(
      occurrence.routeId,
      (occurrenceCounts.get(occurrence.routeId) ?? 0) + 1,
    );
  }

  return place.stopOccurrences.flatMap((occurrence) => {
    const route = routesById.get(occurrence.routeId);
    if (!route) return [];
    const board = getCampusBusStopBoard(
      route,
      occurrence.stopOccurrenceId,
      now,
    );
    const nextArrival =
      board.dockingArrival ?? board.upcomingArrivals[0] ?? null;
    const repeatedStopTotal = occurrenceCounts.get(occurrence.routeId) ?? 1;
    const repeatedStopIndex =
      (occurrenceIndexes.get(occurrence.routeId) ?? 0) + 1;
    occurrenceIndexes.set(occurrence.routeId, repeatedStopIndex);

    return [
      {
        ...occurrence,
        board,
        nextArrival,
        nextTimeKind:
          nextArrival === null
            ? null
            : nextArrival.arrivalAt === nextArrival.departureAt
              ? "origin_departure"
              : "arrival_projection",
        repeatedStopIndex: repeatedStopTotal > 1 ? repeatedStopIndex : null,
        repeatedStopTotal,
      },
    ];
  });
}
