import officialDerivedPriors from "@campus-transport-data/cold-start/official-2026-09-derived-priors.json";
import route4Geodata from "@campus-transport-data/geodata/route-4.osm.json";
import officialService202609 from "@campus-transport-data/official-service-2026-09-01.json";

import type {
  CampusBusPattern,
  CampusBusRoute,
} from "@/lib/campus-transport/campus-bus";
import {
  buildOsmRouteMap,
  buildPatternRouteMap,
  type RawCampusBusGeodata,
} from "@/lib/campus-transport/route-map-builder";

const CURRENT_SERVICE_EFFECTIVE_FROM = "2026-09-01";

type CurrentRouteSource = (typeof officialService202609.routes)[number];
type Projection = CampusBusPattern["projections"][number];

const currentSourcesByDisplayCode = new Map(
  officialService202609.routes.map((source) => [
    source.displayCode.toLowerCase(),
    source,
  ]),
);

function sourceRef(source: CurrentRouteSource) {
  return `cuhk-route-${source.wordpressSlug}:${source.sourceSha256}`;
}

function cloneRoute(route: CampusBusRoute): CampusBusRoute {
  return {
    ...route,
    academicTerms: route.academicTerms.map((term) => ({ ...term })),
    datasetProvenance: { ...route.datasetProvenance },
    map: {
      ...route.map,
      sources: route.map.sources.map((source) => ({ ...source })),
      stopCoordinates: { ...route.map.stopCoordinates },
    },
    patterns: route.patterns.map((pattern) => ({
      ...pattern,
      departureMinutes: [...pattern.departureMinutes],
      projections: pattern.projections.map((projection) => ({
        ...projection,
        evidence: {
          ...projection.evidence,
          segmentSourceRefs: [...projection.evidence.segmentSourceRefs],
        },
        sourceRefs: [...projection.sourceRefs],
      })),
      sourceRefs: [...pattern.sourceRefs],
    })),
    publicHolidayDates: [...route.publicHolidayDates],
    readingWeeks: route.readingWeeks.map((week) => ({ ...week })),
    serviceBands: route.serviceBands.map((band) => ({ ...band })),
    sourceIdentity: { ...route.sourceIdentity },
    stops: route.stops.map((stop) => ({ ...stop })),
  };
}

function currentIdentity(
  route: CampusBusRoute,
  displayCode = route.code,
  publicSlug = displayCode.toLocaleLowerCase("en"),
): CampusBusRoute {
  const source = currentSourcesByDisplayCode.get(
    displayCode.toLocaleLowerCase("en"),
  );
  if (!source) {
    throw new Error(`Missing 2026-09 source for Route ${displayCode}`);
  }
  const currentRef = sourceRef(source);
  return {
    ...route,
    datasetId: `${route.datasetId}:official-2026-09-01`,
    datasetProvenance: {
      ...route.datasetProvenance,
      parserVersion: "cuhk-official-service-review/2026-09-01",
      snapshotGeneratedAt: officialService202609.fetchedAt,
      snapshotSha256: officialService202609.restCollection.sha256,
    },
    lineageId: source.lineageId,
    officialUrl: source.localizedSourceUrl,
    patterns: route.patterns.map((pattern) => ({
      ...pattern,
      sourceRefs: [...new Set([...pattern.sourceRefs, currentRef])],
      projections: pattern.projections.map((projection) => ({
        ...projection,
        sourceRefs: [...new Set([...projection.sourceRefs, currentRef])],
      })),
    })),
    routeId: source.routeId,
    routeRevisionId: `${source.routeId}:from-2026-09-01`,
    slug: publicSlug,
    sourceIdentity: {
      displayCode: source.displayCode,
      wordpressPostId: source.wordpressPostId,
      wordpressSlug: source.wordpressSlug,
      sourceUrl: source.sourceUrl,
      sourceContentSha256: source.sourceSha256,
    },
    validFrom: CURRENT_SERVICE_EFFECTIVE_FROM,
    validTo: null,
  };
}

export function buildCurrentCampusBusRoutes(
  historicalCampusBusRoutes: CampusBusRoute[],
): CampusBusRoute[] {
  function routeById(routeId: string) {
    const route = historicalCampusBusRoutes.find(
      (candidate) => candidate.routeId === routeId,
    );
    if (!route) throw new Error(`Missing historical Route ${routeId}`);
    return cloneRoute(route);
  }

  function stopName(route: CampusBusRoute, occurrenceId: string) {
    const stop = route.stops.find((candidate) => candidate.id === occurrenceId);
    if (!stop) throw new Error(`Missing stop occurrence ${occurrenceId}`);
    return stop;
  }

  function rebuildStops(
    patterns: CampusBusPattern[],
    knownStops: Map<
      string,
      Omit<CampusBusRoute["stops"][number], "sequence" | "partialService">
    >,
  ) {
    const patternCount = new Map<string, number>();
    for (const pattern of patterns) {
      for (const projection of pattern.projections) {
        patternCount.set(
          projection.stopOccurrenceId,
          (patternCount.get(projection.stopOccurrenceId) ?? 0) + 1,
        );
      }
    }
    const orderedIds = [
      ...new Set(
        patterns.flatMap((pattern) =>
          pattern.projections.map((projection) => projection.stopOccurrenceId),
        ),
      ),
    ];
    return orderedIds.map((occurrenceId, index) => {
      const stop = knownStops.get(occurrenceId);
      if (!stop) throw new Error(`Missing stop metadata for ${occurrenceId}`);
      return {
        ...stop,
        sequence: index + 1,
        partialService: (patternCount.get(occurrenceId) ?? 0) < patterns.length,
      };
    });
  }

  function buildCurrentRoute1() {
    const route = routeById("1a");
    const current = currentIdentity(route, "1");
    return {
      ...current,
      code: "1",
      routeNameEn: "1 Main Campus",
      routeNameZhHant: "1 本部線",
      serviceBands: current.serviceBands.map((band) => ({
        ...band,
        endMinutes: 18 * 60 + 55,
        serviceRuleRaw: "07:40-18:55 For Mon to Sat (Except Public Holidays)",
      })),
      serviceHoursLabel: "07:40-18:55",
      patterns: current.patterns.map((pattern) => ({
        ...pattern,
        departureMinutes: [10, 25, 40, 55],
        revisionId: `${pattern.id}:2026-09-01`,
      })),
      subtitle: "本部環線",
    };
  }

  function projectionTemplate(
    route: CampusBusRoute,
    patternId: string,
    occurrenceId: string,
  ) {
    const projection = route.patterns
      .find((pattern) => pattern.id === patternId)
      ?.projections.find(
        (candidate) => candidate.stopOccurrenceId === occurrenceId,
      );
    if (!projection) {
      throw new Error(`Missing projection ${patternId} ${occurrenceId}`);
    }
    return projection;
  }

  function derivedProjection(
    template: Projection,
    stopOccurrenceId: string,
    p50Seconds: number,
    sourceKind: string,
    derivationRef: string,
    supportingRefs: string[] = [],
  ): Projection {
    const sourceRefs = [
      ...new Set([
        ...template.sourceRefs,
        ...template.evidence.segmentSourceRefs,
        ...supportingRefs,
        derivationRef,
      ]),
    ];
    return {
      ...template,
      evidence: {
        ...template.evidence,
        bottleneckSampleCount: 0,
        containsReviewMatch: false,
        routeScope: derivationRef,
        segmentSamplesTotal: 0,
        serviceDayCount: null,
        segmentSourceRefs: sourceRefs,
      },
      offsetConfidence: "weak_prior",
      p10Seconds: null,
      p50Seconds,
      p90Seconds: null,
      sampleCount: 0,
      serviceDayCount: null,
      sourceKind,
      sourceRefs,
      stopOccurrenceId,
    };
  }

  function buildCurrentRoute2S() {
    const route1b = routeById("1b");
    const route2 = routeById("2");
    const source = currentSourcesByDisplayCode.get("2s")!;
    const derivation = officialDerivedPriors.derivations.route2s;
    const derivationRef = `cupedia-cold-start-derivation:2s:${derivation.revisionId}`;
    const routes = new Map([
      [route1b.routeId, route1b],
      [route2.routeId, route2],
    ]);
    const sourceRoute = (routeId: string) => {
      const route = routes.get(routeId);
      if (!route) throw new Error(`Missing Route 2S prior route ${routeId}`);
      return route;
    };
    const origin = derivation.origin;
    const originRoute = sourceRoute(origin.sourceRouteId);
    const originTemplate = projectionTemplate(
      originRoute,
      origin.sourcePatternId,
      origin.sourceOccurrenceId,
    );
    const definitions: Array<{
      occurrenceId: string;
      projection: Projection;
      sourceOccurrenceId: string;
      sourceRoute: CampusBusRoute;
    }> = [
      {
        occurrenceId: origin.outputOccurrenceId,
        projection: derivedProjection(
          originTemplate,
          origin.outputOccurrenceId,
          0,
          derivation.sourceKind,
          derivationRef,
        ),
        sourceOccurrenceId: origin.sourceOccurrenceId,
        sourceRoute: originRoute,
      },
    ];
    let cumulativeSeconds = 0;
    for (const segment of derivation.segments) {
      const route = sourceRoute(segment.sourceRouteId);
      const from = projectionTemplate(
        route,
        segment.sourcePatternId,
        segment.fromOccurrenceId,
      );
      const to = projectionTemplate(
        route,
        segment.sourcePatternId,
        segment.toOccurrenceId,
      );
      const segmentSeconds = to.p50Seconds - from.p50Seconds;
      if (segmentSeconds < 0) {
        throw new Error(
          `Negative Route 2S prior segment ${segment.fromOccurrenceId} -> ${segment.toOccurrenceId}`,
        );
      }
      cumulativeSeconds += segmentSeconds;
      definitions.push({
        occurrenceId: segment.outputOccurrenceId,
        projection: derivedProjection(
          to,
          segment.outputOccurrenceId,
          cumulativeSeconds,
          derivation.sourceKind,
          derivationRef,
          from.sourceRefs,
        ),
        sourceOccurrenceId: segment.toOccurrenceId,
        sourceRoute: route,
      });
    }
    const projections = definitions.map((definition) => definition.projection);
    const pattern: CampusBusPattern = {
      confidence: "low_official_sequence_with_inherited_cold_start_offsets",
      departureMinutes: [0, 30],
      id: "2s:default",
      revisionId: "2s:default:2026-09-01",
      projections,
      serviceDayType: "scheduled_service_day",
      sourceRefs: [
        sourceRef(source),
        `cuhk-notice-8321:${officialService202609.notice.imageSha256}`,
        `cuhk-pdf-shuttle-2026-09:${officialService202609.pdfs[0]!.sha256}`,
      ],
    };
    const knownStops = new Map(
      definitions.map((definition) => {
        const original = stopName(
          definition.sourceRoute,
          definition.sourceOccurrenceId,
        );
        return [
          definition.occurrenceId,
          {
            id: definition.occurrenceId,
            nameEn: original.nameEn,
            nameZhHant: original.nameZhHant,
            stopId: original.stopId,
          },
        ];
      }),
    );
    const base = currentIdentity(route1b, "2s");
    return {
      ...base,
      code: "2S",
      defaultStopId: "cuhk-wp-stop-2812#1",
      frequencyLabel: "約每 30 分鐘一班",
      map: buildPatternRouteMap("2s", [pattern], route2.map, route1b.map),
      patterns: [pattern],
      routeNameEn: "2S NA/UC (S)",
      routeNameZhHant: "2S 新聯線(S)",
      seedModelRevisionId: `cold-start:2s:${officialService202609.notice.imageSha256.slice(0, 16)}`,
      serviceHoursLabel: "08:00-18:30",
      stops: rebuildStops([pattern], knownStops),
      subtitle: "大學站廣場往大學站·經研究生宿舍一座",
    };
  }

  function buildCurrentRoute2() {
    const route = currentIdentity(routeById("2"));
    return {
      ...route,
      patterns: route.patterns.map((pattern) => ({
        ...pattern,
        departureMinutes: pattern.id === "2:via-shaw-hall" ? [45] : [15],
        revisionId: `${pattern.id}:2026-09-01`,
      })),
      frequencyLabel: "約每 30 分鐘一班",
    };
  }

  function buildCurrentRoute7() {
    const route = currentIdentity(routeById("7"));
    return {
      ...route,
      frequencyLabel: "每小時 00、18 分開出",
      patterns: route.patterns.map((pattern) => ({
        ...pattern,
        departureMinutes: [0, 18],
        revisionId: "7:default:2026-09-01",
      })),
      serviceBands: route.serviceBands.map((band, index) => ({
        ...band,
        endMinutes: index === 0 ? 17 * 60 + 18 : 13 * 60 + 18,
        serviceRuleRaw:
          index === 0
            ? "08:18 - 17:18 Mon to Fri; Teaching days only"
            : "08:18 - 13:18 Sat; Teaching days only",
      })),
      serviceHoursLabel: "08:18-17:18",
    };
  }

  function buildCurrentRoute8() {
    const route = currentIdentity(routeById("8"));
    const source = currentSourcesByDisplayCode.get("8")!;
    const sourceRefForCurrentRoute = sourceRef(source);
    const derivation = officialDerivedPriors.derivations.route8;
    const derivationRef = `cupedia-cold-start-derivation:8:${derivation.revisionId}`;
    const sourceRoute = routeById(derivation.sourceRouteId);
    const prefix = derivation.prefixOccurrenceIds.map((occurrenceId) => ({
      occurrenceId,
      projection: projectionTemplate(
        sourceRoute,
        derivation.sourcePatternId,
        occurrenceId,
      ),
    }));
    const connector = projectionTemplate(
      sourceRoute,
      derivation.sourcePatternId,
      derivation.connectorOccurrenceId,
    );
    const knownStops = new Map(
      route.stops.map((stop) => [
        stop.id,
        {
          id: stop.id,
          nameEn: stop.nameEn,
          nameZhHant: stop.nameZhHant,
          stopId: stop.stopId,
        },
      ]),
    );
    for (const item of prefix) {
      const stop = stopName(sourceRoute, item.occurrenceId);
      knownStops.set(item.occurrenceId, {
        id: item.occurrenceId,
        nameEn: stop.nameEn,
        nameZhHant: stop.nameZhHant,
        stopId: stop.stopId,
      });
    }
    const patterns = route.patterns.map((pattern) => {
      const prefixProjections = prefix.map(({ occurrenceId, projection }) =>
        derivedProjection(
          projection,
          occurrenceId,
          projection.p50Seconds,
          derivation.sourceKind,
          derivationRef,
        ),
      );
      return {
        ...pattern,
        confidence: "low_new_prefix_plus_traceable_existing_route_prior",
        departureMinutes: [15, 35, 55],
        revisionId: `${pattern.id}:2026-09-01`,
        projections: [
          ...prefixProjections,
          ...pattern.projections.map((projection) =>
            derivedProjection(
              {
                ...projection,
                sourceRefs: projection.sourceRefs.filter(
                  (reference) => reference !== sourceRefForCurrentRoute,
                ),
              },
              projection.stopOccurrenceId,
              projection.p50Seconds + connector.p50Seconds,
              derivation.sourceKind,
              derivationRef,
              connector.sourceRefs,
            ),
          ),
        ],
      };
    });
    return {
      ...route,
      defaultStopId: "cuhk-wp-stop-2913#1",
      frequencyLabel: "約每 20 分鐘一班",
      map: buildPatternRouteMap(
        "8",
        patterns,
        buildOsmRouteMap(route4Geodata as RawCampusBusGeodata),
        route.map,
      ),
      patterns,
      serviceBands: route.serviceBands.map((band) => ({
        ...band,
        startMinutes: 7 * 60 + 35,
        endMinutes: 18 * 60 + 35,
        serviceRuleRaw: "07:35 - 18:35 For Mon to Sat (Except Public Holidays)",
      })),
      serviceHoursLabel: "07:35-18:35",
      stops: rebuildStops(patterns, knownStops),
      subtitle: "康本園往大學站",
    };
  }

  function buildCurrentRouteH() {
    const route = currentIdentity(routeById("h"));
    const retiredOccurrenceId = "cuhk-wp-stop-2967#1";
    const patterns = route.patterns.map((pattern) => ({
      ...pattern,
      revisionId: `${pattern.id}:2026-09-01`,
      projections: pattern.projections.filter(
        (projection) => projection.stopOccurrenceId !== retiredOccurrenceId,
      ),
    }));
    return {
      ...route,
      patterns,
      stops: route.stops
        .filter((stop) => stop.id !== retiredOccurrenceId)
        .map((stop, index) => ({ ...stop, sequence: index + 1 })),
    };
  }

  return [
    buildCurrentRoute1(),
    buildCurrentRoute2(),
    buildCurrentRoute2S(),
    currentIdentity(routeById("3")),
    currentIdentity(routeById("4")),
    currentIdentity(routeById("5")),
    currentIdentity(routeById("6a")),
    currentIdentity(routeById("6b")),
    buildCurrentRoute7(),
    buildCurrentRoute8(),
    currentIdentity(routeById("n")),
    buildCurrentRouteH(),
  ];
}
