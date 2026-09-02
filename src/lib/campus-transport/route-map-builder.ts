import type {
  CampusBusPattern,
  CampusBusRouteMap,
  LngLat,
} from "@/lib/campus-transport/campus-bus";
import {
  ROUTE_2_GEOMETRY,
  ROUTE_2_STOP_COORDINATES,
} from "@/lib/campus-transport/route-2-map";
import { buildStopAnchoredRouteGeometry } from "@/lib/campus-transport/route-geometry";

export type RawCampusBusGeodata = {
  geometry: CampusBusRouteMap["geometry"];
  source: { attribution: string; sourceUrl: string };
  stopOccurrences: Array<{
    coordinates: number[];
    occurrenceId: string;
  }>;
};

export function buildRoute2Map(): CampusBusRouteMap {
  return {
    geometry: ROUTE_2_GEOMETRY,
    sources: [
      {
        attribution: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/relation/21069990",
      },
    ],
    stopCoordinates: Object.fromEntries(
      Object.entries(ROUTE_2_STOP_COORDINATES).map(([stopId, coordinates]) => [
        `${stopId}#1`,
        coordinates,
      ]),
    ),
  };
}

export function buildOsmRouteMap(
  geodata: RawCampusBusGeodata,
): CampusBusRouteMap {
  return {
    geometry: geodata.geometry,
    sources: [
      {
        attribution: geodata.source.attribution,
        url: geodata.source.sourceUrl,
      },
    ],
    stopCoordinates: Object.fromEntries(
      geodata.stopOccurrences.map((stop) => {
        if (stop.coordinates.length !== 2) {
          throw new Error(
            `Invalid coordinates for stop occurrence ${stop.occurrenceId}`,
          );
        }
        return [
          stop.occurrenceId,
          [stop.coordinates[0], stop.coordinates[1]] satisfies LngLat,
        ];
      }),
    ),
  };
}

export function buildRoute8Map(
  geodata: RawCampusBusGeodata,
): CampusBusRouteMap {
  const map = buildOsmRouteMap(geodata);
  return {
    ...map,
    stopCoordinates: {
      ...map.stopCoordinates,
      "cuhk-wp-stop-2812#1": [114.2097625, 22.4139575],
      "cuhk-wp-stop-2810#1": [114.208359, 22.4160358],
    },
  };
}

function geometryLines(map: CampusBusRouteMap): number[][][] {
  if (map.geometry.type !== "Feature" || !map.geometry.geometry) return [];
  const geometry = map.geometry.geometry;
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  if (geometry.type === "LineString") return [geometry.coordinates];
  return [];
}

export function buildPatternRouteMap(
  route: string,
  patterns: CampusBusPattern[],
  ...maps: CampusBusRouteMap[]
): CampusBusRouteMap {
  const candidateMap: CampusBusRouteMap = {
    geometry: {
      type: "Feature",
      properties: { route },
      geometry: {
        type: "MultiLineString",
        coordinates: maps.flatMap(geometryLines),
      },
    },
    sources: [
      ...new Map(
        maps
          .flatMap((map) => map.sources)
          .map((source) => [source.url, source] as const),
      ).values(),
    ],
    stopCoordinates: Object.assign(
      {},
      ...maps.map((map) => map.stopCoordinates),
    ),
  };
  const stopSequences = patterns.map((pattern) =>
    pattern.projections.map((projection) => {
      const coordinates =
        candidateMap.stopCoordinates[projection.stopOccurrenceId];
      if (!coordinates) {
        throw new Error(
          `Missing map coordinates for ${route} ${projection.stopOccurrenceId}`,
        );
      }
      return coordinates;
    }),
  );
  return {
    ...candidateMap,
    geometry: buildStopAnchoredRouteGeometry(
      candidateMap.geometry,
      stopSequences,
      { route },
    ),
  };
}
