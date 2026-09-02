import route1aDataset from "@campus-transport-data/cold-start/route-1a.staging.json";
import route1bDataset from "@campus-transport-data/cold-start/route-1b.staging.json";
import route2Dataset from "@campus-transport-data/cold-start/route-2.staging.json";
import route3Dataset from "@campus-transport-data/cold-start/route-3.staging.json";
import route4Dataset from "@campus-transport-data/cold-start/route-4.staging.json";
import route5Dataset from "@campus-transport-data/cold-start/route-5.staging.json";
import route6aDataset from "@campus-transport-data/cold-start/route-6a.staging.json";
import route6bDataset from "@campus-transport-data/cold-start/route-6b.staging.json";
import route7Dataset from "@campus-transport-data/cold-start/route-7.staging.json";
import route8Dataset from "@campus-transport-data/cold-start/route-8.staging.json";
import routeHDataset from "@campus-transport-data/cold-start/route-h.staging.json";
import routeNDataset from "@campus-transport-data/cold-start/route-n.staging.json";
import route1aGeodata from "@campus-transport-data/geodata/route-1a.osm.json";
import route1bGeodata from "@campus-transport-data/geodata/route-1b.osm.json";
import route3Geodata from "@campus-transport-data/geodata/route-3.osm.json";
import route4Geodata from "@campus-transport-data/geodata/route-4.osm.json";
import route5Geodata from "@campus-transport-data/geodata/route-5.osm.json";
import route6aGeodata from "@campus-transport-data/geodata/route-6a.osm.json";
import route6bGeodata from "@campus-transport-data/geodata/route-6b.osm.json";
import route7Geodata from "@campus-transport-data/geodata/route-7.osm.json";
import route8Geodata from "@campus-transport-data/geodata/route-8.osm.json";
import routeHGeodata from "@campus-transport-data/geodata/route-h.osm.json";
import routeNGeodata from "@campus-transport-data/geodata/route-n.osm.json";

import {
  campusBusRouteRevisionIsValidOn,
  type CampusBusPattern,
  type CampusBusRoute,
  type CampusBusRouteMap,
  type CampusBusServiceBand,
  type CampusBusServiceDayRule,
} from "@/lib/campus-transport/campus-bus";
import { buildCurrentCampusBusRoutes } from "@/lib/campus-transport/current-route-revisions";
import {
  buildOsmRouteMap,
  buildRoute2Map,
  buildRoute8Map,
  type RawCampusBusGeodata,
} from "@/lib/campus-transport/route-map-builder";

type RawProjection = {
  evidence: {
    segmentCount: number;
    segmentSamplesTotal: number;
    bottleneckSampleCount: number;
    serviceDayCount: number | null;
    routeScope: string;
    containsReviewMatch: boolean;
    segmentSourceRefs: string[];
  };
  fallbackLevel: string;
  offsetConfidence: string;
  p10Seconds: number | null;
  p50Seconds: number | null;
  p90Seconds: number | null;
  publicationStatus: "staging_only";
  sampleCount: number;
  serviceDayCount: number | null;
  sourceKind: string;
  sourceRefs: string[];
  stopId: string;
  stopNameEn: string;
  stopNameZhHant: string;
  stopSequence: number;
};

type RawColdStartDataset = {
  datasetId: string;
  derivedFrom: {
    communityPriorSha256?: string;
    parserVersion: string;
    snapshotGeneratedAt: string;
    snapshotSha256: string;
  };
  seedModelRevisionId: string;
  patterns: Array<{
    activation: {
      departureMinutes: number[];
      serviceDayType: string;
    };
    confidence: string;
    patternId: string;
    patternRevisionId: string;
    projections: RawProjection[];
    sourceRefs: string[];
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

type RouteUiMetadata = {
  canonicalPatternId?: string;
  color: string;
  defaultStopId?: string;
  subtitle: string;
};

// The current catalog contains only the reviewed free shuttle routes. Their
// official pages identify the service as being for CUHK students and staff;
// see docs/campus-transport/research/cuhk-public-data-source-catalog.md.
// Keep this scoped constant instead of a generic default so future paid or
// restricted route ingestion must choose its own reviewed eligibility.
const FREE_SHUTTLE_RIDER_ELIGIBILITY = "students-and-staff" as const;

const historicalServiceValidFrom: Record<string, string> = {
  "1a": "2024-09-03",
  "1b": "2024-09-03",
  "2": "2024-09-03",
  "3": "2024-09-03",
  "4": "2024-09-03",
  "5": "2024-09-02",
  "6a": "2024-09-02",
  "6b": "2024-09-02",
  "7": "2024-09-02",
  "8": "2024-09-03",
  h: "2024-08-26",
  n: "2024-08-26",
};

const legacyWordpressPostIds: Record<string, number> = {
  "1a": 2554,
  "1b": 2567,
  "2": 2865,
  "3": 2869,
  "4": 2878,
  "5": 2766,
  "6a": 2768,
  "6b": 2890,
  "7": 2893,
  "8": 2880,
  h: 2885,
  n: 2883,
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
      confidence: pattern.confidence,
      id: pattern.patternId,
      revisionId: pattern.patternRevisionId,
      departureMinutes: [...pattern.activation.departureMinutes],
      serviceDayType: pattern.activation.serviceDayType,
      sourceRefs: [...pattern.sourceRefs],
      projections: pattern.projections.flatMap((projection, index) =>
        projection.p50Seconds === null
          ? []
          : [
              {
                evidence: {
                  ...projection.evidence,
                  segmentSourceRefs: [...projection.evidence.segmentSourceRefs],
                },
                fallbackLevel: projection.fallbackLevel,
                offsetConfidence: projection.offsetConfidence,
                p10Seconds: projection.p10Seconds,
                stopOccurrenceId: ids[index],
                p50Seconds: projection.p50Seconds,
                p90Seconds: projection.p90Seconds,
                publicationStatus: projection.publicationStatus,
                sampleCount: projection.sampleCount,
                serviceDayCount: projection.serviceDayCount,
                sourceKind: projection.sourceKind,
                sourceRefs: [...projection.sourceRefs],
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
    datasetProvenance: { ...rawDataset.derivedFrom },
    defaultStopId: metadata.defaultStopId ?? stops[0]?.id ?? "",
    frequencyLabel: formatFrequency(patterns),
    map: {
      ...map,
      sources: map.sources.map((source) => ({ ...source })),
      stopCoordinates: { ...map.stopCoordinates },
    },
    officialUrl: rawDataset.route.officialUrl,
    patterns,
    publicHolidayDates: [...rawDataset.service.publicHolidayDates],
    readingWeeks: rawDataset.service.readingWeeks.map((week) => ({
      startDate: week.startDate,
      endDate: week.endDate,
    })),
    routeId: rawDataset.route.routeId,
    routeRevisionId: `${rawDataset.route.routeId}:through-2026-08-31`,
    lineageId: `route-lineage-${rawDataset.route.routeId}`,
    validFrom: historicalServiceValidFrom[rawDataset.route.routeId] ?? null,
    validTo: "2026-08-31",
    sourceIdentity: {
      displayCode: rawDataset.route.routeId.toUpperCase(),
      wordpressPostId: legacyWordpressPostIds[rawDataset.route.routeId]!,
      wordpressSlug: rawDataset.route.routeId,
      sourceUrl: rawDataset.route.officialUrl,
      sourceContentSha256: rawDataset.derivedFrom.snapshotSha256,
    },
    seedModelRevisionId: rawDataset.seedModelRevisionId,
    routeNameEn: rawDataset.route.nameEn,
    routeNameZhHant: rawDataset.route.nameZhHant,
    riderEligibility: FREE_SHUTTLE_RIDER_ELIGIBILITY,
    serviceBands,
    serviceHoursLabel,
    slug: rawDataset.route.routeId,
    status: rawDataset.status,
    stops,
    subtitle: metadata.subtitle,
  };
}

const historicalDatasets: Array<[RawColdStartDataset, CampusBusRouteMap]> = [
  [
    route1aDataset as RawColdStartDataset,
    buildOsmRouteMap(route1aGeodata as RawCampusBusGeodata),
  ],
  [
    route1bDataset as RawColdStartDataset,
    buildOsmRouteMap(route1bGeodata as RawCampusBusGeodata),
  ],
  [route2Dataset as RawColdStartDataset, buildRoute2Map()],
  [
    route3Dataset as RawColdStartDataset,
    buildOsmRouteMap(route3Geodata as RawCampusBusGeodata),
  ],
  [
    route4Dataset as RawColdStartDataset,
    buildOsmRouteMap(route4Geodata as RawCampusBusGeodata),
  ],
  [
    route5Dataset as RawColdStartDataset,
    buildOsmRouteMap(route5Geodata as RawCampusBusGeodata),
  ],
  [
    route6aDataset as RawColdStartDataset,
    buildOsmRouteMap(route6aGeodata as RawCampusBusGeodata),
  ],
  [
    route6bDataset as RawColdStartDataset,
    buildOsmRouteMap(route6bGeodata as RawCampusBusGeodata),
  ],
  [
    route7Dataset as RawColdStartDataset,
    buildOsmRouteMap(route7Geodata as RawCampusBusGeodata),
  ],
  [
    route8Dataset as RawColdStartDataset,
    buildRoute8Map(route8Geodata as RawCampusBusGeodata),
  ],
  [
    routeNDataset as RawColdStartDataset,
    buildOsmRouteMap(routeNGeodata as RawCampusBusGeodata),
  ],
  [
    routeHDataset as RawColdStartDataset,
    buildOsmRouteMap(routeHGeodata as RawCampusBusGeodata),
  ],
];

export const historicalCampusBusRoutes = historicalDatasets.map(
  ([dataset, map]) => buildRoute(dataset, map),
);

export const campusBusRoutes = buildCurrentCampusBusRoutes(
  historicalCampusBusRoutes,
);

export const route2ViewData = campusBusRoutes.find(
  (route) => route.routeId === "2",
)!;

function routeMatchesIdentifier(route: CampusBusRoute, identifier: string) {
  const normalizedIdentifier = identifier.toLocaleLowerCase("en");
  return (
    route.routeId.toLocaleLowerCase("en") === normalizedIdentifier ||
    route.slug.toLocaleLowerCase("en") === normalizedIdentifier ||
    route.code.toLocaleLowerCase("en") === normalizedIdentifier
  );
}

export function getCampusBusRoute(routeId: string) {
  return campusBusRoutes.find((route) =>
    routeMatchesIdentifier(route, routeId),
  );
}

function isValidServiceDate(serviceDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function getCampusBusRoutesForServiceDate(serviceDate: string) {
  if (!isValidServiceDate(serviceDate)) return [];
  return [...historicalCampusBusRoutes, ...campusBusRoutes].filter((route) =>
    campusBusRouteRevisionIsValidOn(route, serviceDate),
  );
}

export function getCampusBusRouteForServiceDate(
  routeId: string,
  serviceDate: string,
) {
  return getCampusBusRoutesForServiceDate(serviceDate).find((route) =>
    routeMatchesIdentifier(route, routeId),
  );
}

export function isRetiredCampusBusRouteId(routeId: string) {
  return routeId.toLowerCase() === "1b";
}
