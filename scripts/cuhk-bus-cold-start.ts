import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { format } from "prettier";

const GENERATOR_VERSION = "cuhk-cold-start/4";
const DEFAULT_INPUT = resolve(
  "docs/campus-transport/data/cuhk-public-data/merged.snapshot.json",
);
const DEFAULT_OUTPUT = resolve(
  "docs/campus-transport/data/cold-start/route-2.staging.json",
);

type StopMatch = {
  status: "auto" | "review" | "unmatched";
  stopId: string | null;
};

type SegmentPrior = {
  segmentKey: string;
  fromMatch: StopMatch;
  toMatch: StopMatch;
  routeScope: string | null;
  sampleCount: number;
  p10Seconds: number | null;
  p50Seconds: number | null;
  p90Seconds: number | null;
  sourceRef: string;
  confidence: string;
};

type Stop = {
  stopId: string;
  nameEn: string;
  nameZhHant: string;
};

type PatternStop = {
  sequence: number;
  stopId: string;
  stopName: string;
  sourceName: string;
};

type RoutePattern = {
  patternId: string;
  activation: {
    departureMinutes: number[];
    serviceDayType: string;
  };
  stopSequence: PatternStop[];
  evidence: {
    officialPdfSourceRef: string;
    officialPdfPages: number[];
    officialRoutePageSourceRefs: string[];
    busClockSourceRef: string;
    busClockVariantIds: string[];
  };
  confidence: string;
};

type Route = {
  routeId: string;
  name: string;
  nameZhHant: string;
  sourceRef: string;
  scheduleBands?: Array<{
    sourceOrdinal: number;
    startTime: string;
    endTime: string;
    departureMinutes: number[];
    serviceRuleRaw: string;
    departureRuleRaw: string;
    parseStatus: string;
  }>;
  officialMapEvidence?: {
    sourceRef: string;
    routePatterns: RoutePattern[];
  };
};

export type PublicDataSnapshot = {
  generatedAt: string;
  parserVersion: string;
  merged: {
    routes: Route[];
    stops: Stop[];
    segmentTravelTimePriors: SegmentPrior[];
    serviceCalendars?: {
      academicCalendars?: Array<{
        sourceRef: string;
        firstTerm: { startDate: string; endDate: string };
        secondTerm: { startDate: string; endDate: string };
        readingWeek?: { startDate: string; endDate: string };
      }>;
      publicHolidays?: {
        sourceRef: string;
        events: Array<{ date: string }>;
      };
    };
  };
};

export type ServiceDayRule =
  | "daily"
  | "monday_friday_teaching_days"
  | "monday_saturday_except_public_holidays"
  | "saturday_teaching_days"
  | "sunday_and_public_holidays";

type ProjectionEvidence = {
  segmentCount: number;
  segmentSamplesTotal: number;
  bottleneckSampleCount: number;
  serviceDayCount: null;
  routeScope: "mixed_or_unknown";
  containsReviewMatch: boolean;
  segmentSourceRefs: string[];
};

export type OffsetConfidence =
  | "official"
  | "weak_observation"
  | "weak_prior"
  | "unavailable";

export type ColdStartSegmentBaseline = {
  fromStopId: string;
  fromStopSequence: number;
  toStopId: string;
  toStopSequence: number;
  baselineSeconds: number | null;
  sourceKind: "community-prior" | "public-observation" | "unavailable";
  sourceRefs: string[];
  confidence: Exclude<OffsetConfidence, "official">;
  sensitivityCheck: {
    absoluteDifferenceSeconds: number | null;
    p50Seconds: number | null;
    routeScope: "mixed_or_unknown";
    sampleCount: number;
    sourceRefs: string[];
  };
};

type CommunityPrior = {
  sha256: string;
  sourceRef: string;
  patterns: Record<string, number[]>;
};

export type ColdStartProjection = {
  patternRevisionId: string;
  stopId: string;
  stopSequence: number;
  stopNameEn: string;
  stopNameZhHant: string;
  cumulativeOffsetSeconds: number | null;
  p10Seconds: number | null;
  p50Seconds: number | null;
  p90Seconds: number | null;
  intervalMethod:
    | "origin"
    | "sum_segment_empirical_quantiles_not_joint_trip_quantiles"
    | "community-route-point-estimate"
    | "unavailable";
  sourceKind:
    | "official-origin"
    | "public-observation"
    | "community-prior"
    | "unavailable";
  sourceRefs: string[];
  sampleCount: number;
  serviceDayCount: null;
  fallbackLevel:
    | "origin"
    | "adjacent-pair-public-prior"
    | "shortest-public-prior-path"
    | "community-route-baseline"
    | "unavailable";
  baselineSourceRefs: string[];
  offsetConfidence: OffsetConfidence;
  publicationStatus: "staging_only";
  evidence: ProjectionEvidence;
};

type PriorPathEdge = {
  prior: SegmentPrior;
  toStopId: string;
};

export type ColdStartDataset = {
  schemaVersion: "cuhk-cold-start-projection/2";
  generatorVersion: string;
  datasetId: string;
  seedModelRevisionId: string;
  status: "staging_only";
  route: {
    routeId: string;
    nameEn: string;
    nameZhHant: string;
    officialUrl: string;
  };
  service: {
    scheduleBands: Array<{
      startTime: string;
      endTime: string;
      serviceDayRule: ServiceDayRule;
      serviceRuleRaw: string;
    }>;
    publicHolidayDates: string[];
    publicHolidaySourceRef: string | null;
    academicTerms: Array<{
      sourceRef: string;
      startDate: string;
      endDate: string;
    }>;
    readingWeeks: Array<{
      sourceRef: string;
      startDate: string;
      endDate: string;
    }>;
  };
  derivedFrom: {
    communityPriorSha256?: string;
    parserVersion: string;
    snapshotGeneratedAt: string;
    snapshotSha256: string;
  };
  publicationBlockers: string[];
  coverage: {
    patterns: number;
    stopProjections: number;
    availableStopProjections: number;
    unavailableStopProjections: number;
    uniqueObservedSegmentPairs: number;
  };
  patterns: Array<{
    patternId: string;
    patternRevisionId: string;
    activation: RoutePattern["activation"];
    confidence: string;
    sourceRefs: string[];
    segments: ColdStartSegmentBaseline[];
    projections: ColdStartProjection[];
  }>;
};

type CommunityRoute = {
  id: string;
  stop_ids: string[];
};

type CommunityRouteSegment = {
  expected_duration_sec: number;
  from_stop_id: string;
  route_id: string;
  to_stop_id: string;
};

const COMMUNITY_PATTERN_ROUTES: Record<string, Record<string, string>> = {
  "1a": { "1a:default": "1A" },
  "1b": { "1b:via-pgh1": "1B" },
  "2": { "2:default": "2", "2:via-shaw-hall": "2_sir_run_run" },
  "3": { "3:default": "3" },
  "4": { "4:default": "4" },
  "5": { "5:default": "5" },
  "6a": { "6a:default": "6A" },
  "6b": { "6b:default": "6B" },
  "7": { "7:default": "7" },
  "8": { "8:teaching-day": "8", "8:non-teaching-day": "8_non_teach" },
  h: { "h:default": "H", "h:00-via-pgh1-area39": "H_area_39" },
  n: { "n:default": "N", "n:00-via-pgh1": "N_postgrad" },
};

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function segmentIndexKey(fromStopId: string, toStopId: string) {
  return `${fromStopId}>>${toStopId}`;
}

function hasUsableQuantiles(prior: SegmentPrior) {
  return (
    prior.sampleCount > 0 &&
    prior.p10Seconds !== null &&
    prior.p50Seconds !== null &&
    prior.p90Seconds !== null
  );
}

function selectSegmentPrior(
  patternId: string,
  key: string,
  candidates: SegmentPrior[],
) {
  if (candidates.length <= 1) return candidates[0];

  const exactMatches = candidates.filter(
    (candidate) =>
      candidate.fromMatch.status === "auto" &&
      candidate.toMatch.status === "auto",
  );
  if (exactMatches.length === 1) return exactMatches[0];

  throw new Error(
    `Ambiguous segment prior for ${patternId} ${key}: ${candidates
      .map((candidate) => candidate.segmentKey)
      .join(", ")}`,
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function buildPriorGraph(priorsByPair: Map<string, SegmentPrior[]>) {
  const graph = new Map<string, PriorPathEdge[]>();
  for (const [key, candidates] of priorsByPair) {
    const [fromStopId, toStopId] = key.split(">>");
    if (!fromStopId || !toStopId) continue;
    const exactMatches = candidates.filter(
      (candidate) =>
        candidate.fromMatch.status === "auto" &&
        candidate.toMatch.status === "auto",
    );
    const prior =
      candidates.length === 1
        ? candidates[0]
        : exactMatches.length === 1
          ? exactMatches[0]
          : null;
    if (!prior) continue;
    graph.set(fromStopId, [
      ...(graph.get(fromStopId) ?? []),
      { prior, toStopId },
    ]);
  }
  return graph;
}

function findShortestPriorPath(
  graph: Map<string, PriorPathEdge[]>,
  fromStopId: string,
  toStopId: string,
) {
  const distances = new Map<string, number>([[fromStopId, 0]]);
  const paths = new Map<string, SegmentPrior[]>([[fromStopId, []]]);
  const visited = new Set<string>();

  while (visited.size < distances.size) {
    const current = [...distances.entries()]
      .filter(([stopId]) => !visited.has(stopId))
      .sort((left, right) => left[1] - right[1])[0];
    if (!current) break;
    const [currentStopId, currentDistance] = current;
    if (currentStopId === toStopId) return paths.get(currentStopId) ?? null;
    visited.add(currentStopId);

    for (const edge of graph.get(currentStopId) ?? []) {
      if (visited.has(edge.toStopId)) continue;
      const nextDistance = currentDistance + edge.prior.p50Seconds!;
      if (nextDistance >= (distances.get(edge.toStopId) ?? Infinity)) continue;
      distances.set(edge.toStopId, nextDistance);
      paths.set(edge.toStopId, [
        ...(paths.get(currentStopId) ?? []),
        edge.prior,
      ]);
    }
  }

  return null;
}

function classifyServiceDayRule(raw: string): ServiceDayRule {
  const normalized = raw.toLowerCase().replaceAll(/\s+/g, " ").trim();
  if (normalized.includes("sun & public holidays")) {
    return "sunday_and_public_holidays";
  }
  if (normalized.includes("mon to sun & public holidays")) return "daily";
  if (normalized.includes("mon to fri") && normalized.includes("teaching")) {
    return "monday_friday_teaching_days";
  }
  if (normalized.includes("sat") && normalized.includes("teaching")) {
    return "saturday_teaching_days";
  }
  if (
    normalized.includes("mon to sat") &&
    (normalized.includes("except public holiday") ||
      normalized.includes("public holidays)") ||
      normalized.includes("公眾假期除外"))
  ) {
    return "monday_saturday_except_public_holidays";
  }
  throw new Error(`Unsupported service-day rule: ${raw}`);
}

export function buildColdStartDataset(
  snapshot: PublicDataSnapshot,
  routeId: string,
  snapshotSha256 = stableHash(snapshot),
  communityPrior: CommunityPrior | null = null,
): ColdStartDataset {
  const route = snapshot.merged.routes.find((item) => item.routeId === routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);

  const patterns = route.officialMapEvidence?.routePatterns ?? [];
  if (patterns.length === 0) {
    throw new Error(`Route ${routeId} has no reviewed route patterns`);
  }

  const stopsById = new Map(
    snapshot.merged.stops.map((stop) => [stop.stopId, stop]),
  );
  const priorsByPair = new Map<string, SegmentPrior[]>();
  for (const prior of snapshot.merged.segmentTravelTimePriors) {
    const fromStopId = prior.fromMatch.stopId;
    const toStopId = prior.toMatch.stopId;
    if (!fromStopId || !toStopId || !hasUsableQuantiles(prior)) continue;
    const key = segmentIndexKey(fromStopId, toStopId);
    priorsByPair.set(key, [...(priorsByPair.get(key) ?? []), prior]);
  }
  const priorGraph = buildPriorGraph(priorsByPair);

  const modelHash = stableHash({
    communityPriorSha256: communityPrior?.sha256 ?? null,
    generatorVersion: GENERATOR_VERSION,
    routeId,
    snapshotSha256,
  });
  const seedModelRevisionId = `cold-start:${routeId}:${modelHash.slice(0, 16)}`;

  const patternResults = patterns.map((pattern) => {
    if (pattern.stopSequence.length === 0) {
      throw new Error(`Pattern ${pattern.patternId} has no stops`);
    }

    const patternRevisionId = `${pattern.patternId}:${stableHash({
      stopSequence: pattern.stopSequence,
      evidence: pattern.evidence,
    }).slice(0, 16)}`;
    const officialSourceRefs = unique([
      route.sourceRef,
      route.officialMapEvidence!.sourceRef,
      pattern.evidence.officialPdfSourceRef,
      ...pattern.evidence.officialRoutePageSourceRefs,
    ]);
    const patternSourceRefs = unique([
      ...officialSourceRefs,
      pattern.evidence.busClockSourceRef,
    ]);
    const selectedSegments: SegmentPrior[] = [];
    const communityOffsets = communityPrior?.patterns[pattern.patternId];
    if (
      communityOffsets &&
      communityOffsets.length !== pattern.stopSequence.length
    ) {
      throw new Error(
        `Pattern ${pattern.patternId} has ${communityOffsets.length} community offsets but ${pattern.stopSequence.length} official stops`,
      );
    }
    let cumulativeP10 = 0;
    let cumulativeP50 = 0;
    let cumulativeP90 = 0;
    let cumulativeAvailable = true;
    let containsInferredPath = false;

    const projections = pattern.stopSequence.map((patternStop, index) => {
      const stop = stopsById.get(patternStop.stopId);
      if (!stop) {
        throw new Error(
          `Pattern ${pattern.patternId} references unknown stop ${patternStop.stopId}`,
        );
      }

      if (index > 0 && communityOffsets) {
        const previous = pattern.stopSequence[index - 1];
        const key = segmentIndexKey(previous.stopId, patternStop.stopId);
        const selected = selectSegmentPrior(
          pattern.patternId,
          key,
          priorsByPair.get(key) ?? [],
        );
        if (selected) selectedSegments.push(selected);
      } else if (index > 0 && cumulativeAvailable) {
        const previous = pattern.stopSequence[index - 1];
        const key = segmentIndexKey(previous.stopId, patternStop.stopId);
        const candidates = priorsByPair.get(key) ?? [];
        const selected = selectSegmentPrior(pattern.patternId, key, candidates);
        const path = selected
          ? [selected]
          : communityOffsets
            ? null
            : findShortestPriorPath(
                priorGraph,
                previous.stopId,
                patternStop.stopId,
              );
        if (!path || path.length === 0) {
          cumulativeAvailable = false;
        } else {
          containsInferredPath ||= !selected;
          selectedSegments.push(...path);
          cumulativeP10 += path.reduce(
            (total, segment) => total + segment.p10Seconds!,
            0,
          );
          cumulativeP50 += path.reduce(
            (total, segment) => total + segment.p50Seconds!,
            0,
          );
          cumulativeP90 += path.reduce(
            (total, segment) => total + segment.p90Seconds!,
            0,
          );
        }
      }

      const segmentSourceRefs = unique(
        selectedSegments.map((segment) => segment.sourceRef),
      );
      const segmentSamples = selectedSegments.map(
        (segment) => segment.sampleCount,
      );
      const containsReviewMatch = selectedSegments.some(
        (segment) =>
          segment.fromMatch.status !== "auto" ||
          segment.toMatch.status !== "auto",
      );
      const evidence: ProjectionEvidence = {
        segmentCount: selectedSegments.length,
        segmentSamplesTotal: segmentSamples.reduce(
          (total, count) => total + count,
          0,
        ),
        bottleneckSampleCount:
          segmentSamples.length > 0 ? Math.min(...segmentSamples) : 0,
        serviceDayCount: null,
        routeScope: "mixed_or_unknown",
        containsReviewMatch,
        segmentSourceRefs,
      };
      const isOrigin = index === 0;
      const communityOffset = communityOffsets?.[index];
      const usesCommunityPrior =
        !isOrigin && typeof communityOffset === "number";
      const isAvailable = isOrigin || cumulativeAvailable || usesCommunityPrior;
      const projectionSourceRefs = usesCommunityPrior
        ? unique([
            ...patternSourceRefs,
            communityPrior!.sourceRef,
            ...segmentSourceRefs,
          ])
        : unique([...patternSourceRefs, ...segmentSourceRefs]);
      const baselineSourceRefs = isOrigin
        ? officialSourceRefs
        : usesCommunityPrior
          ? [communityPrior!.sourceRef]
          : isAvailable
            ? segmentSourceRefs
            : [];

      return {
        patternRevisionId,
        stopId: stop.stopId,
        stopSequence: patternStop.sequence,
        stopNameEn: stop.nameEn,
        stopNameZhHant: stop.nameZhHant,
        cumulativeOffsetSeconds: usesCommunityPrior
          ? communityOffset
          : isAvailable
            ? roundOne(cumulativeP50)
            : null,
        p10Seconds: usesCommunityPrior
          ? null
          : isAvailable
            ? roundOne(cumulativeP10)
            : null,
        p50Seconds: usesCommunityPrior
          ? communityOffset
          : isAvailable
            ? roundOne(cumulativeP50)
            : null,
        p90Seconds: usesCommunityPrior
          ? null
          : isAvailable
            ? roundOne(cumulativeP90)
            : null,
        intervalMethod: isOrigin
          ? "origin"
          : usesCommunityPrior
            ? "community-route-point-estimate"
            : isAvailable
              ? "sum_segment_empirical_quantiles_not_joint_trip_quantiles"
              : "unavailable",
        sourceKind: isOrigin
          ? "official-origin"
          : usesCommunityPrior
            ? "community-prior"
            : isAvailable
              ? "public-observation"
              : "unavailable",
        sourceRefs: projectionSourceRefs,
        sampleCount: usesCommunityPrior ? 0 : evidence.bottleneckSampleCount,
        serviceDayCount: null,
        fallbackLevel: isOrigin
          ? "origin"
          : usesCommunityPrior
            ? "community-route-baseline"
            : isAvailable
              ? containsInferredPath
                ? "shortest-public-prior-path"
                : "adjacent-pair-public-prior"
              : "unavailable",
        baselineSourceRefs,
        offsetConfidence: isOrigin
          ? "official"
          : usesCommunityPrior
            ? "weak_prior"
            : isAvailable
              ? "weak_observation"
              : "unavailable",
        publicationStatus: "staging_only",
        evidence,
      } satisfies ColdStartProjection;
    });

    const segments: ColdStartSegmentBaseline[] = pattern.stopSequence
      .slice(1)
      .map((current, zeroBasedIndex) => {
        const index = zeroBasedIndex + 1;
        const previous = pattern.stopSequence[index - 1];
        const key = segmentIndexKey(previous.stopId, current.stopId);
        const observedPrior = selectSegmentPrior(
          pattern.patternId,
          key,
          priorsByPair.get(key) ?? [],
        );
        const observedPath = observedPrior
          ? [observedPrior]
          : communityOffsets
            ? null
            : findShortestPriorPath(
                priorGraph,
                previous.stopId,
                current.stopId,
              );
        const communitySeconds = communityOffsets
          ? communityOffsets[index] - communityOffsets[index - 1]
          : null;
        if (communitySeconds !== null && communitySeconds < 0) {
          throw new Error(
            `Pattern ${pattern.patternId} has a decreasing community offset at stop ${current.stopId}`,
          );
        }
        const observedSeconds = observedPath?.reduce(
          (total, prior) => total + prior.p50Seconds!,
          0,
        );
        const baselineSeconds =
          communitySeconds ??
          (typeof observedSeconds === "number"
            ? roundOne(observedSeconds)
            : null);
        const usesCommunityBaseline = communitySeconds !== null;
        const sourceRefs = usesCommunityBaseline
          ? [communityPrior!.sourceRef]
          : unique(observedPath?.map((prior) => prior.sourceRef) ?? []);

        return {
          fromStopId: previous.stopId,
          fromStopSequence: previous.sequence,
          toStopId: current.stopId,
          toStopSequence: current.sequence,
          baselineSeconds,
          sourceKind: usesCommunityBaseline
            ? "community-prior"
            : baselineSeconds !== null
              ? "public-observation"
              : "unavailable",
          sourceRefs,
          confidence: usesCommunityBaseline
            ? "weak_prior"
            : baselineSeconds !== null
              ? "weak_observation"
              : "unavailable",
          sensitivityCheck: {
            absoluteDifferenceSeconds:
              communitySeconds !== null &&
              typeof observedPrior?.p50Seconds === "number"
                ? roundOne(
                    Math.abs(communitySeconds - observedPrior.p50Seconds),
                  )
                : null,
            p50Seconds: observedPrior?.p50Seconds ?? null,
            routeScope: "mixed_or_unknown",
            sampleCount: observedPrior?.sampleCount ?? 0,
            sourceRefs: observedPrior ? [observedPrior.sourceRef] : [],
          },
        };
      });

    return {
      patternId: pattern.patternId,
      patternRevisionId,
      activation: pattern.activation,
      confidence: pattern.confidence,
      sourceRefs: patternSourceRefs,
      segments,
      projections,
    };
  });

  const allProjections = patternResults.flatMap(
    (pattern) => pattern.projections,
  );
  const observedSegmentPairs = new Set<string>();
  for (const pattern of patterns) {
    for (let index = 1; index < pattern.stopSequence.length; index += 1) {
      const previous = pattern.stopSequence[index - 1];
      const current = pattern.stopSequence[index];
      const key = segmentIndexKey(previous.stopId, current.stopId);
      if (
        selectSegmentPrior(pattern.patternId, key, priorsByPair.get(key) ?? [])
      ) {
        observedSegmentPairs.add(key);
      }
    }
  }

  return {
    schemaVersion: "cuhk-cold-start-projection/2",
    generatorVersion: GENERATOR_VERSION,
    datasetId: `cold-start-dataset:${routeId}:${modelHash.slice(0, 16)}`,
    seedModelRevisionId,
    status: "staging_only",
    route: {
      routeId: route.routeId,
      nameEn: route.name,
      nameZhHant: route.nameZhHant,
      officialUrl: `https://transport.cuhk.edu.hk/tc/route/${route.routeId}/`,
    },
    service: {
      scheduleBands: (route.scheduleBands ?? []).map((band) => ({
        startTime: band.startTime,
        endTime: band.endTime,
        serviceDayRule: classifyServiceDayRule(band.serviceRuleRaw),
        serviceRuleRaw: band.serviceRuleRaw,
      })),
      publicHolidayDates:
        snapshot.merged.serviceCalendars?.publicHolidays?.events.map(
          (event) => event.date,
        ) ?? [],
      publicHolidaySourceRef:
        snapshot.merged.serviceCalendars?.publicHolidays?.sourceRef ?? null,
      academicTerms: (
        snapshot.merged.serviceCalendars?.academicCalendars ?? []
      ).flatMap((calendar) => [
        { sourceRef: calendar.sourceRef, ...calendar.firstTerm },
        { sourceRef: calendar.sourceRef, ...calendar.secondTerm },
      ]),
      readingWeeks: (
        snapshot.merged.serviceCalendars?.academicCalendars ?? []
      ).flatMap((calendar) =>
        calendar.readingWeek
          ? [{ sourceRef: calendar.sourceRef, ...calendar.readingWeek }]
          : [],
      ),
    },
    derivedFrom: {
      ...(communityPrior
        ? { communityPriorSha256: communityPrior.sha256 }
        : {}),
      parserVersion: snapshot.parserVersion,
      snapshotGeneratedAt: snapshot.generatedAt,
      snapshotSha256,
    },
    publicationBlockers: [
      "bus_clock_data_license_unresolved",
      "not_validated_against_independent_arrival_truth",
      "segment_priors_have_no_route_scope",
      "fallback_paths_can_include_unserved_intermediate_stops",
      "cumulative_intervals_are_not_joint_trip_quantiles",
    ],
    coverage: {
      patterns: patternResults.length,
      stopProjections: allProjections.length,
      availableStopProjections: allProjections.filter(
        (projection) => projection.cumulativeOffsetSeconds !== null,
      ).length,
      unavailableStopProjections: allProjections.filter(
        (projection) => projection.cumulativeOffsetSeconds === null,
      ).length,
      uniqueObservedSegmentPairs: observedSegmentPairs.size,
    },
    patterns: patternResults,
  };
}

async function loadCommunityPrior(routeId: string) {
  const patternRoutes = COMMUNITY_PATTERN_ROUTES[routeId];
  if (!patternRoutes) return null;

  const routePath = resolve(
    "docs/campus-transport/data/third-party/cu-bus-app/export/routes-compact.json",
  );
  const segmentPath = resolve(
    "docs/campus-transport/data/third-party/cu-bus-app/export/route_segment.json",
  );
  const [routeBytes, segmentBytes] = await Promise.all([
    readFile(routePath),
    readFile(segmentPath),
  ]);
  const routes = JSON.parse(routeBytes.toString("utf8")) as CommunityRoute[];
  const segments = JSON.parse(
    segmentBytes.toString("utf8"),
  ) as CommunityRouteSegment[];
  const segmentIndex = new Map(
    segments.map((segment) => [
      `${segment.route_id}>>${segment.from_stop_id}>>${segment.to_stop_id}`,
      segment.expected_duration_sec,
    ]),
  );
  const patterns = Object.fromEntries(
    Object.entries(patternRoutes).map(([patternId, communityRouteId]) => {
      const route = routes.find(
        (candidate) => candidate.id === communityRouteId,
      );
      if (!route)
        throw new Error(`Missing community route ${communityRouteId}`);
      const origin = route.stop_ids[0];
      const offsets = route.stop_ids.map((stopId, index) => {
        if (index === 0) return 0;
        const offset = segmentIndex.get(
          `${communityRouteId}>>${origin}>>${stopId}`,
        );
        if (typeof offset !== "number") {
          throw new Error(
            `Missing community offset ${communityRouteId} ${origin} -> ${stopId}`,
          );
        }
        return offset;
      });
      return [patternId, offsets];
    }),
  );

  return {
    patterns,
    sha256: createHash("sha256")
      .update(routeBytes)
      .update(segmentBytes)
      .digest("hex"),
    sourceRef:
      "cu-bus-app-v1.18:c0d045c980aee48e66e3d81a88f22eed227bae29a9f56c38ca2320705704cd2d",
  } satisfies CommunityPrior;
}

async function main() {
  const inputPath = resolve(process.argv[2] ?? DEFAULT_INPUT);
  const routeId = process.argv[3] ?? "2";
  const outputPath = resolve(process.argv[4] ?? DEFAULT_OUTPUT);
  const inputBytes = await readFile(inputPath);
  const snapshot = JSON.parse(
    inputBytes.toString("utf8"),
  ) as PublicDataSnapshot;
  const snapshotSha256 = createHash("sha256").update(inputBytes).digest("hex");
  const communityPrior = await loadCommunityPrior(routeId);
  const dataset = buildColdStartDataset(
    snapshot,
    routeId,
    snapshotSha256,
    communityPrior,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    await format(JSON.stringify(dataset), { parser: "json" }),
  );
  console.log(
    `Wrote ${dataset.coverage.availableStopProjections}/${dataset.coverage.stopProjections} available stop projections to ${outputPath}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
