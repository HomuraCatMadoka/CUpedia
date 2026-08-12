import route1aDataset from "../../../docs/campus-transport/data/cold-start/route-1a.staging.json";
import route1bDataset from "../../../docs/campus-transport/data/cold-start/route-1b.staging.json";
import route2Dataset from "../../../docs/campus-transport/data/cold-start/route-2.staging.json";
import route3Dataset from "../../../docs/campus-transport/data/cold-start/route-3.staging.json";
import route4Dataset from "../../../docs/campus-transport/data/cold-start/route-4.staging.json";
import route5Dataset from "../../../docs/campus-transport/data/cold-start/route-5.staging.json";
import route6aDataset from "../../../docs/campus-transport/data/cold-start/route-6a.staging.json";
import route6bDataset from "../../../docs/campus-transport/data/cold-start/route-6b.staging.json";
import route7Dataset from "../../../docs/campus-transport/data/cold-start/route-7.staging.json";
import route8Dataset from "../../../docs/campus-transport/data/cold-start/route-8.staging.json";
import routeHDataset from "../../../docs/campus-transport/data/cold-start/route-h.staging.json";
import routeNDataset from "../../../docs/campus-transport/data/cold-start/route-n.staging.json";
import route1aGeodata from "../../../docs/campus-transport/data/geodata/route-1a.osm.json";
import route1bGeodata from "../../../docs/campus-transport/data/geodata/route-1b.osm.json";
import route3Geodata from "../../../docs/campus-transport/data/geodata/route-3.osm.json";
import route4Geodata from "../../../docs/campus-transport/data/geodata/route-4.osm.json";
import route5Geodata from "../../../docs/campus-transport/data/geodata/route-5.osm.json";
import route6aGeodata from "../../../docs/campus-transport/data/geodata/route-6a.osm.json";
import route6bGeodata from "../../../docs/campus-transport/data/geodata/route-6b.osm.json";
import route7Geodata from "../../../docs/campus-transport/data/geodata/route-7.osm.json";
import route8Geodata from "../../../docs/campus-transport/data/geodata/route-8.osm.json";
import routeHGeodata from "../../../docs/campus-transport/data/geodata/route-h.osm.json";
import routeNGeodata from "../../../docs/campus-transport/data/geodata/route-n.osm.json";

import type {
  CampusBusPattern,
  CampusBusRoute,
  CampusBusRouteMap,
  CampusBusServiceBand,
  CampusBusServiceDayRule,
  LngLat,
} from "@/lib/campus-transport/campus-bus";
import {
  ROUTE_2_GEOMETRY,
  ROUTE_2_STOP_COORDINATES,
} from "@/lib/campus-transport/route-2-map";

type RawProjection = {
  p50Seconds: number | null;
  stopId: string;
  stopNameEn: string;
  stopNameZhHant: string;
  stopSequence: number;
};

type RawColdStartDataset = {
  datasetId: string;
  patterns: Array<{
    activation: {
      departureMinutes: number[];
      serviceDayType: string;
    };
    patternId: string;
    projections: RawProjection[];
  }>;
  route: {
    nameEn: string;
    nameZhHant: string;
    officialUrl: string;
    routeId: string;
  };
  service: {
    academicTerms: Array<{
      endDate: string;
      sourceRef: string;
      startDate: string;
    }>;
    publicHolidayDates: string[];
    readingWeeks: Array<{
      endDate: string;
      sourceRef: string;
      startDate: string;
    }>;
    scheduleBands: Array<{
      endTime: string;
      serviceDayRule: CampusBusServiceDayRule;
      serviceRuleRaw: string;
      startTime: string;
    }>;
  };
  status: "staging_only";
};

type RawGeodata = {
  geometry: CampusBusRouteMap["geometry"];
  source: { attribution: string; sourceUrl: string };
  stopOccurrences: Array<{
    coordinates: number[];
    occurrenceId: string;
  }>;
};

type RouteUiMetadata = {
  canonicalPatternId?: string;
  color: string;
  defaultStopId?: string;
  subtitle: string;
};

const routeUiMetadata: Record<string, RouteUiMetadata> = {
  "1a": {
    color: "#4f6f52",
    subtitle: "本部環線",
  },
  "1b": {
    color: "#3f6f89",
    subtitle: "本部環線 · 經研究生宿舍一座",
  },
  "2": {
    color: "#5b2a73",
    defaultStopId: "cuhk-wp-stop-2550#1",
    subtitle: "校園環線",
  },
  "3": {
    color: "#76527f",
    subtitle: "康本園往大學站廣場",
  },
  "4": {
    color: "#8a4f2f",
    subtitle: "校園環迴線",
  },
  "5": {
    color: "#8a633c",
    subtitle: "崇基教學樓往敬文書院",
  },
  "6a": {
    color: "#585823",
    subtitle: "敬文書院往崇基教學樓",
  },
  "6b": {
    color: "#3f438f",
    subtitle: "新亞書院往崇基教學樓",
  },
  "7": {
    color: "#666666",
    subtitle: "逸夫書院往崇基教學樓",
  },
  "8": {
    canonicalPatternId: "8:teaching-day",
    color: "#7a3657",
    subtitle: "西部校園往大學站",
  },
  h: {
    color: "#453087",
    subtitle: "星期日及公眾假期環線",
  },
  n: {
    color: "#7961a8",
    subtitle: "晚間校園環線",
  },
};

function occurrenceIds(projections: RawProjection[]) {
  const counts = new Map<string, number>();
  return projections.map((projection) => {
    const occurrence = (counts.get(projection.stopId) ?? 0) + 1;
    counts.set(projection.stopId, occurrence);
    return `${projection.stopId}#${occurrence}`;
  });
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid service time: ${value}`);
  }
  return hours * 60 + minutes;
}

function formatFrequency(patterns: CampusBusPattern[]) {
  const minutes = [
    ...new Set(patterns.flatMap((pattern) => pattern.departureMinutes)),
  ].sort((left, right) => left - right);
  if (minutes.length < 2) return "按官方時刻開出";
  const cyclicMinutes = [...minutes, minutes[0] + 60];
  const gaps = cyclicMinutes
    .slice(1)
    .map((minute, index) => minute - cyclicMinutes[index]);
  const minimum = Math.min(...gaps);
  const maximum = Math.max(...gaps);
  return minimum === maximum
    ? `約每 ${minimum} 分鐘一班`
    : `約每 ${minimum}-${maximum} 分鐘一班`;
}

function route2Map(): CampusBusRouteMap {
  return {
    attribution: "© OpenStreetMap contributors",
    geometry: ROUTE_2_GEOMETRY,
    sourceUrl: "https://www.openstreetmap.org/relation/21069990",
    stopCoordinates: Object.fromEntries(
      Object.entries(ROUTE_2_STOP_COORDINATES).map(([stopId, coordinates]) => [
        `${stopId}#1`,
        coordinates,
      ]),
    ),
  };
}

function osmMap(geodata: RawGeodata): CampusBusRouteMap {
  return {
    attribution: geodata.source.attribution,
    geometry: geodata.geometry,
    sourceUrl: geodata.source.sourceUrl,
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

function route8Map(): CampusBusRouteMap {
  const map = osmMap(route8Geodata as RawGeodata);
  return {
    ...map,
    stopCoordinates: {
      ...map.stopCoordinates,
      "cuhk-wp-stop-2812#1": [114.2097625, 22.4139575],
      "cuhk-wp-stop-2810#1": [114.208359, 22.4160358],
    },
  };
}

function buildRoute(
  rawDataset: RawColdStartDataset,
  map: CampusBusRouteMap,
): CampusBusRoute {
  if (rawDataset.status !== "staging_only") {
    throw new Error("Campus bus cold-start datasets must remain staging-only");
  }
  const metadata = routeUiMetadata[rawDataset.route.routeId];
  if (!metadata) {
    throw new Error(
      `Missing UI metadata for route ${rawDataset.route.routeId}`,
    );
  }
  const canonicalPattern =
    rawDataset.patterns.find(
      (pattern) => pattern.patternId === metadata.canonicalPatternId,
    ) ??
    rawDataset.patterns.reduce((current, candidate) =>
      candidate.projections.length > current.projections.length
        ? candidate
        : current,
    );
  const patterns: CampusBusPattern[] = rawDataset.patterns.map((pattern) => {
    const ids = occurrenceIds(pattern.projections);
    return {
      id: pattern.patternId,
      departureMinutes: [...pattern.activation.departureMinutes],
      serviceDayType: pattern.activation.serviceDayType,
      projections: pattern.projections.flatMap((projection, index) =>
        projection.p50Seconds === null
          ? []
          : [
              {
                stopOccurrenceId: ids[index],
                p50Seconds: projection.p50Seconds,
              },
            ],
      ),
    };
  });
  const stopPatternCount = new Map<string, number>();
  for (const pattern of patterns) {
    for (const projection of pattern.projections) {
      stopPatternCount.set(
        projection.stopOccurrenceId,
        (stopPatternCount.get(projection.stopOccurrenceId) ?? 0) + 1,
      );
    }
  }
  const orderedStopProjections: Array<{
    occurrenceId: string;
    projection: RawProjection;
  }> = [];
  const seenOccurrenceIds = new Set<string>();
  for (const pattern of [
    canonicalPattern,
    ...rawDataset.patterns.filter(
      (pattern) => pattern.patternId !== canonicalPattern.patternId,
    ),
  ]) {
    const ids = occurrenceIds(pattern.projections);
    pattern.projections.forEach((projection, index) => {
      const occurrenceId = ids[index];
      if (seenOccurrenceIds.has(occurrenceId)) return;
      seenOccurrenceIds.add(occurrenceId);
      orderedStopProjections.push({ occurrenceId, projection });
    });
  }
  const stops = orderedStopProjections.map(
    ({ occurrenceId, projection }, index) => ({
      id: occurrenceId,
      stopId: projection.stopId,
      sequence: index + 1,
      nameEn: projection.stopNameEn,
      nameZhHant: projection.stopNameZhHant,
      partialService:
        (stopPatternCount.get(occurrenceId) ?? 0) < patterns.length,
    }),
  );
  const serviceBands = rawDataset.service.scheduleBands.map((band) => ({
    startMinutes: timeToMinutes(band.startTime),
    endMinutes: timeToMinutes(band.endTime),
    serviceDayRule: band.serviceDayRule,
    serviceRuleRaw: band.serviceRuleRaw,
  }));
  const firstBand = serviceBands.reduce<CampusBusServiceBand | undefined>(
    (earliest, band) =>
      !earliest || band.startMinutes < earliest.startMinutes ? band : earliest,
    undefined,
  );
  const lastBand = serviceBands.reduce<CampusBusServiceBand | undefined>(
    (latest, band) =>
      !latest || band.endMinutes > latest.endMinutes ? band : latest,
    undefined,
  );
  const serviceHoursLabel =
    firstBand && lastBand
      ? `${String(Math.floor(firstBand.startMinutes / 60)).padStart(2, "0")}:${String(firstBand.startMinutes % 60).padStart(2, "0")}-${String(Math.floor(lastBand.endMinutes / 60)).padStart(2, "0")}:${String(lastBand.endMinutes % 60).padStart(2, "0")}`
      : "時間待核對";

  return {
    academicTerms: rawDataset.service.academicTerms.map((term) => ({
      startDate: term.startDate,
      endDate: term.endDate,
    })),
    code: rawDataset.route.routeId.toUpperCase(),
    datasetId: rawDataset.datasetId,
    defaultStopId: metadata.defaultStopId ?? stops[0]?.id ?? "",
    frequencyLabel: formatFrequency(patterns),
    map: { ...map, stopCoordinates: { ...map.stopCoordinates } },
    officialUrl: rawDataset.route.officialUrl,
    patterns,
    publicHolidayDates: [...rawDataset.service.publicHolidayDates],
    readingWeeks: rawDataset.service.readingWeeks.map((week) => ({
      startDate: week.startDate,
      endDate: week.endDate,
    })),
    routeId: rawDataset.route.routeId,
    routeNameEn: rawDataset.route.nameEn,
    routeNameZhHant: rawDataset.route.nameZhHant,
    serviceBands,
    serviceHoursLabel,
    slug: rawDataset.route.routeId,
    status: rawDataset.status,
    stops,
    subtitle: metadata.subtitle,
  };
}

const datasets: Array<[RawColdStartDataset, CampusBusRouteMap]> = [
  [route1aDataset as RawColdStartDataset, osmMap(route1aGeodata as RawGeodata)],
  [route1bDataset as RawColdStartDataset, osmMap(route1bGeodata as RawGeodata)],
  [route2Dataset as RawColdStartDataset, route2Map()],
  [route3Dataset as RawColdStartDataset, osmMap(route3Geodata as RawGeodata)],
  [route4Dataset as RawColdStartDataset, osmMap(route4Geodata as RawGeodata)],
  [route5Dataset as RawColdStartDataset, osmMap(route5Geodata as RawGeodata)],
  [route6aDataset as RawColdStartDataset, osmMap(route6aGeodata as RawGeodata)],
  [route6bDataset as RawColdStartDataset, osmMap(route6bGeodata as RawGeodata)],
  [route7Dataset as RawColdStartDataset, osmMap(route7Geodata as RawGeodata)],
  [route8Dataset as RawColdStartDataset, route8Map()],
  [routeNDataset as RawColdStartDataset, osmMap(routeNGeodata as RawGeodata)],
  [routeHDataset as RawColdStartDataset, osmMap(routeHGeodata as RawGeodata)],
];

export const campusBusRoutes = datasets.map(([dataset, map]) =>
  buildRoute(dataset, map),
);

export const route2ViewData = campusBusRoutes.find(
  (route) => route.routeId === "2",
)!;

export function getCampusBusRoute(routeId: string) {
  return campusBusRoutes.find(
    (route) => route.routeId.toLowerCase() === routeId.toLowerCase(),
  );
}
