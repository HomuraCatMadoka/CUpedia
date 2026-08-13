import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type LogEntry = {
  route: string;
  timeStamp: string;
  location: {
    coords: {
      accuracy: number;
      latitude: number;
      longitude: number;
      speed: number;
    };
    mocked: boolean;
    timestamp: number;
  };
};

type ProcessedEntry = LogEntry & { station: string };

async function main() {
  const sourceRoot = resolve(process.argv[2] ?? ".");
  const busData = await import(
    pathToFileURL(resolve(sourceRoot, "constants/BusData.ts")).href
  );
  const raw = JSON.parse(
    readFileSync(resolve(sourceRoot, "data/bus-log.json"), "utf8"),
  ) as LogEntry[];
  const processed = JSON.parse(
    readFileSync(resolve(sourceRoot, "data/processed-bus-log.json"), "utf8"),
  ) as ProcessedEntry[];
  const published = JSON.parse(
    readFileSync(resolve(sourceRoot, "data/station-times.json"), "utf8"),
  ) as Record<string, number[]>;

  const routeInfos = busData.busRouteInfos as Record<
    string,
    { stations: string[] }
  >;
  const stationCoordinates = busData.stationCoordinates as Record<
    string,
    { latitude: number; longitude: number }
  >;
  const embeddedTimings = busData.busStationTimings as Record<string, number[]>;

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const earthRadiusM = 6_371_000;
    const toRad = Math.PI / 180;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;
    const deltaPhi = (lat2 - lat1) * toRad;
    const deltaLambda = (lon2 - lon1) * toRad;
    const a =
      Math.sin(deltaPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function quantile(values: number[], probability: number) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return (
      sorted[lower] * (upper - position) + sorted[upper] * (position - lower)
    );
  }

  function median(values: number[]) {
    return quantile(values, 0.5) as number;
  }

  function summary(values: number[]) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    return {
      count: values.length,
      min: Math.min(...values),
      p10: quantile(values, 0.1),
      p25: quantile(values, 0.25),
      median: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      p90: quantile(values, 0.9),
      p95: quantile(values, 0.95),
      max: Math.max(...values),
      mean,
      standardDeviation: Math.sqrt(variance),
    };
  }

  function groupBy<T>(values: T[], keyOf: (value: T) => string) {
    return values.reduce<Record<string, T[]>>((groups, value) => {
      const key = keyOf(value);
      (groups[key] ??= []).push(value);
      return groups;
    }, {});
  }

  function hongKongDate(timestamp: string) {
    return new Date(new Date(timestamp).getTime() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  function hongKongHour(timestamp: string) {
    return new Date(new Date(timestamp).getTime() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(11, 13);
  }

  function nearest(entry: LogEntry) {
    const uniqueStations = [...new Set(routeInfos[entry.route].stations)];
    const ranked = uniqueStations
      .map((station) => ({
        station,
        distanceM: haversine(
          entry.location.coords.latitude,
          entry.location.coords.longitude,
          stationCoordinates[station].latitude,
          stationCoordinates[station].longitude,
        ),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);
    return { first: ranked[0], second: ranked[1] };
  }

  function pairIsAdjacent(route: string, from: string, to: string) {
    const stations = routeInfos[route].stations;
    return stations.some(
      (station, index) => station === from && stations[index + 1] === to,
    );
  }

  function pairOrderClass(route: string, from: string, to: string) {
    if (from === to) return "same-station";
    if (pairIsAdjacent(route, from, to)) return "adjacent";
    const stations = routeInfos[route].stations;
    const fromIndices = stations.flatMap((station, index) =>
      station === from ? [index] : [],
    );
    const toIndices = stations.flatMap((station, index) =>
      station === to ? [index] : [],
    );
    if (
      fromIndices.some((fromIndex) =>
        toIndices.some((toIndex) => toIndex > fromIndex),
      )
    ) {
      return "forward-skip";
    }
    return "backtrack-or-wrap";
  }

  function mulberry32(seed: number) {
    return () => {
      let value = (seed += 0x6d2b79f5);
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  function hash(value: string) {
    let result = 2_166_136_261;
    for (const character of value) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16_777_619);
    }
    return result >>> 0;
  }

  const accuracy = raw.map((entry) => entry.location.coords.accuracy);
  const timestampDriftMs = raw.map((entry) =>
    Math.abs(new Date(entry.timeStamp).getTime() - entry.location.timestamp),
  );
  const nearestAssignments = raw.map((entry) => nearest(entry));
  const nearestDistances = nearestAssignments.map(
    ({ first }) => first.distanceM,
  );
  const committedAssignmentDistances = processed.map((entry) =>
    haversine(
      entry.location.coords.latitude,
      entry.location.coords.longitude,
      stationCoordinates[entry.station].latitude,
      stationCoordinates[entry.station].longitude,
    ),
  );
  const assignmentMargins = nearestAssignments.map(
    ({ first, second }) => second.distanceM - first.distanceM,
  );
  const recomputedMismatchCount = processed.filter(
    (entry) => nearest(entry).first.station !== entry.station,
  ).length;
  const recomputedMismatches = processed
    .filter((entry) => nearest(entry).first.station !== entry.station)
    .map((entry) => ({
      route: entry.route,
      timeStamp: entry.timeStamp,
      committedStation: entry.station,
      committedDistanceM: haversine(
        entry.location.coords.latitude,
        entry.location.coords.longitude,
        stationCoordinates[entry.station].latitude,
        stationCoordinates[entry.station].longitude,
      ),
      currentNearestStation: nearest(entry).first.station,
      currentNearestDistanceM: nearest(entry).first.distanceM,
    }));

  type AcceptedSample = {
    route: string;
    pair: string;
    seconds: number;
    date: string;
    hour: string;
  };

  const rebuilt = Object.fromEntries(
    Object.keys(embeddedTimings).map((key) => [key, [] as number[]]),
  ) as Record<string, number[]>;
  const acceptedSamples: AcceptedSample[] = [];
  const consecutiveClasses: Record<string, number> = {};
  let consecutiveSameRouteWithin300 = 0;
  let droppedByPairWhitelist = 0;
  let acceptedNonAdjacentForRoute = 0;
  let nonPositiveIntervals = 0;
  const intervalSeconds: number[] = [];
  const acceptedNonAdjacentDetails: Array<{
    route: string;
    pair: string;
    seconds: number;
    timeStamp: string;
  }> = [];

  const sorted = [...processed].sort(
    (a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime(),
  );
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (current.route !== next.route) continue;
    const seconds = Math.round(
      (new Date(next.timeStamp).getTime() -
        new Date(current.timeStamp).getTime()) /
        1000,
    );
    if (seconds > 300) continue;
    if (seconds <= 0) {
      nonPositiveIntervals += 1;
      continue;
    }
    consecutiveSameRouteWithin300 += 1;
    intervalSeconds.push(seconds);
    const orderClass = pairOrderClass(
      current.route,
      current.station,
      next.station,
    );
    consecutiveClasses[orderClass] = (consecutiveClasses[orderClass] ?? 0) + 1;
    const pair = `${current.station}>>${next.station}`;
    if (!(pair in rebuilt)) {
      droppedByPairWhitelist += 1;
      continue;
    }
    rebuilt[pair].push(seconds);
    if (!pairIsAdjacent(current.route, current.station, next.station)) {
      acceptedNonAdjacentForRoute += 1;
      acceptedNonAdjacentDetails.push({
        route: current.route,
        pair,
        seconds,
        timeStamp: current.timeStamp,
      });
    }
    acceptedSamples.push({
      route: current.route,
      pair,
      seconds,
      date: hongKongDate(current.timeStamp),
      hour: hongKongHour(current.timeStamp),
    });
  }

  const processingReproduction = {
    exact:
      JSON.stringify(rebuilt) === JSON.stringify(published) &&
      Object.keys(rebuilt).every(
        (key) =>
          JSON.stringify(rebuilt[key]) === JSON.stringify(published[key]),
      ),
    mismatchedKeys: Object.keys(rebuilt).filter(
      (key) => JSON.stringify(rebuilt[key]) !== JSON.stringify(published[key]),
    ),
    rebuiltSampleCount: Object.values(rebuilt).flat().length,
    publishedSampleCount: Object.values(published).flat().length,
  };

  const freshlyAssigned = raw
    .map((entry) => ({ ...entry, station: nearest(entry).first.station }))
    .sort(
      (a, b) =>
        new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime(),
    );
  const freshlyRebuilt = Object.fromEntries(
    Object.keys(embeddedTimings).map((key) => [key, [] as number[]]),
  ) as Record<string, number[]>;
  for (let index = 0; index < freshlyAssigned.length - 1; index += 1) {
    const current = freshlyAssigned[index];
    const next = freshlyAssigned[index + 1];
    if (current.route !== next.route) continue;
    const seconds = Math.round(
      (new Date(next.timeStamp).getTime() -
        new Date(current.timeStamp).getTime()) /
        1000,
    );
    if (seconds <= 0 || seconds > 300) continue;
    const pair = `${current.station}>>${next.station}`;
    if (pair in freshlyRebuilt) freshlyRebuilt[pair].push(seconds);
  }
  const freshReprocessing = {
    exact: Object.keys(freshlyRebuilt).every(
      (key) =>
        JSON.stringify(freshlyRebuilt[key]) === JSON.stringify(published[key]),
    ),
    sampleCount: Object.values(freshlyRebuilt).flat().length,
    mismatchedKeyCount: Object.keys(freshlyRebuilt).filter(
      (key) =>
        JSON.stringify(freshlyRebuilt[key]) !== JSON.stringify(published[key]),
    ).length,
    mismatchedKeys: Object.keys(freshlyRebuilt)
      .filter(
        (key) =>
          JSON.stringify(freshlyRebuilt[key]) !==
          JSON.stringify(published[key]),
      )
      .map((key) => ({
        pair: key,
        fresh: freshlyRebuilt[key],
        published: published[key],
      })),
  };

  const embeddedVsGenerated = Object.keys(embeddedTimings).filter(
    (key) =>
      JSON.stringify(embeddedTimings[key]) !== JSON.stringify(published[key]),
  );

  const sampleByPair = groupBy(acceptedSamples, (sample) => sample.pair);
  const pairStats = Object.entries(published)
    .filter(([, values]) => values.length > 0)
    .map(([pair, values]) => {
      const samples = sampleByPair[pair] ?? [];
      const fullMedian = median(values);
      const leaveOneOutMedians =
        values.length >= 2
          ? values.map((_, index) =>
              median(values.filter((__, i) => i !== index)),
            )
          : [];
      const byDate = groupBy(samples, (sample) => sample.date);
      const dates = Object.keys(byDate);
      const leaveOneDateOutMedians =
        dates.length >= 2
          ? dates.map((date) =>
              median(
                samples
                  .filter((sample) => sample.date !== date)
                  .map((sample) => sample.seconds),
              ),
            )
          : [];
      const random = mulberry32(hash(pair));
      const bootstrapMedians = Array.from({ length: 5_000 }, () =>
        median(
          Array.from(
            { length: values.length },
            () => values[Math.floor(random() * values.length)],
          ),
        ),
      );
      const stats = summary(values);
      const deviations = values.map((value) => Math.abs(value - fullMedian));
      const mad = median(deviations);
      const robustThreshold = 3 * 1.4826 * mad;
      return {
        pair,
        ...stats,
        range: stats.max - stats.min,
        coefficientOfVariation:
          stats.mean === 0 ? null : stats.standardDeviation / stats.mean,
        routes: [...new Set(samples.map((sample) => sample.route))],
        serviceDates: dates.length,
        leaveOneOutMaxMedianShift:
          leaveOneOutMedians.length === 0
            ? null
            : Math.max(
                ...leaveOneOutMedians.map((value) =>
                  Math.abs(value - fullMedian),
                ),
              ),
        leaveOneServiceDateOutMaxMedianShift:
          leaveOneDateOutMedians.length === 0
            ? null
            : Math.max(
                ...leaveOneDateOutMedians.map((value) =>
                  Math.abs(value - fullMedian),
                ),
              ),
        bootstrapMedianP025: quantile(bootstrapMedians, 0.025),
        bootstrapMedianP975: quantile(bootstrapMedians, 0.975),
        bootstrapMedianIntervalWidth:
          (quantile(bootstrapMedians, 0.975) as number) -
          (quantile(bootstrapMedians, 0.025) as number),
        robustOutlierCount:
          values.length >= 5 && mad > 0
            ? deviations.filter((value) => value > robustThreshold).length
            : null,
      };
    });

  const fragments: ProcessedEntry[][] = [];
  for (const entry of sorted) {
    const fragment = fragments.at(-1);
    const previous = fragment?.at(-1);
    const breakFragment =
      !previous ||
      previous.route !== entry.route ||
      new Date(entry.timeStamp).getTime() -
        new Date(previous.timeStamp).getTime() >
        300_000 ||
      new Date(entry.timeStamp).getTime() <=
        new Date(previous.timeStamp).getTime();
    if (breakFragment || !fragment) fragments.push([entry]);
    else fragment.push(entry);
  }

  const byHour = Object.fromEntries(
    Object.entries(groupBy(acceptedSamples, (sample) => sample.hour)).map(
      ([hour, samples]) => [hour, samples?.length ?? 0],
    ),
  );

  const report = {
    sourceRoot,
    raw: {
      count: raw.length,
      uniqueTimestamps: new Set(raw.map((entry) => entry.timeStamp)).size,
      mockedCount: raw.filter((entry) => entry.location.mocked).length,
      reportedHorizontalAccuracyM: summary(accuracy),
      accuracyThresholdCounts: {
        atMost5m: accuracy.filter((value) => value <= 5).length,
        atMost10m: accuracy.filter((value) => value <= 10).length,
        atMost20m: accuracy.filter((value) => value <= 20).length,
        over20m: accuracy.filter((value) => value > 20).length,
        over50m: accuracy.filter((value) => value > 50).length,
      },
      topLevelVsLocationTimestampDriftMs: summary(timestampDriftMs),
    },
    stationAssignment: {
      processedCount: processed.length,
      recomputedMismatchCount,
      distanceToCurrentNearestStationM: summary(nearestDistances),
      distanceToCommittedProcessedStationM: summary(
        committedAssignmentDistances,
      ),
      distanceThresholdCounts: {
        atMost10m: nearestDistances.filter((value) => value <= 10).length,
        atMost25m: nearestDistances.filter((value) => value <= 25).length,
        atMost50m: nearestDistances.filter((value) => value <= 50).length,
        over50m: nearestDistances.filter((value) => value > 50).length,
        over100m: nearestDistances.filter((value) => value > 100).length,
      },
      assignedDistanceExceedsReportedAccuracy: nearestDistances.filter(
        (distance, index) => distance > accuracy[index],
      ).length,
      nearestVsSecondNearestMarginM: summary(assignmentMargins),
      ambiguousMarginCounts: {
        under10m: assignmentMargins.filter((value) => value < 10).length,
        under20m: assignmentMargins.filter((value) => value < 20).length,
        underReportedAccuracy: assignmentMargins.filter(
          (value, index) => value < accuracy[index],
        ).length,
      },
      committedStationMissingFromCurrentRoute: processed.filter(
        (entry) => !routeInfos[entry.route].stations.includes(entry.station),
      ).length,
      recomputedMismatches,
      farthestAssignments: raw
        .map((entry, index) => ({
          route: entry.route,
          timeStamp: entry.timeStamp,
          station: nearestAssignments[index].first.station,
          distanceM: nearestAssignments[index].first.distanceM,
          reportedAccuracyM: accuracy[index],
          marginM: assignmentMargins[index],
        }))
        .sort((a, b) => b.distanceM - a.distanceM)
        .slice(0, 10),
    },
    chronology: {
      fragments: fragments.length,
      fragmentLength: summary(fragments.map((fragment) => fragment.length)),
      consecutiveSameRouteWithin300,
      intervalSeconds: summary(intervalSeconds),
      consecutiveClasses,
      droppedByPairWhitelist,
      acceptedSamples: acceptedSamples.length,
      acceptedNonAdjacentForRoute,
      acceptedNonAdjacentDetails,
      nonPositiveIntervals,
      acceptedSamplesByHongKongHour: byHour,
    },
    processingReproduction,
    freshReprocessing,
    embeddedVsGenerated: {
      mismatchedKeyCount: embeddedVsGenerated.length,
      mismatchedKeys: embeddedVsGenerated.map((key) => ({
        pair: key,
        embedded: embeddedTimings[key],
        generated: published[key],
      })),
    },
    pairStability: {
      nonEmptyPairs: pairStats.length,
      singletonPairs: pairStats.filter((pair) => pair.count === 1).length,
      pairsWith2To4Samples: pairStats.filter(
        (pair) => pair.count >= 2 && pair.count <= 4,
      ).length,
      pairsWithAtLeast5Samples: pairStats.filter((pair) => pair.count >= 5)
        .length,
      pairsSpanningAtLeast2ServiceDates: pairStats.filter(
        (pair) => pair.serviceDates >= 2,
      ).length,
      pairsMixingRoutes: pairStats.filter((pair) => pair.routes.length >= 2)
        .length,
      leaveOneOutShiftAtLeast30s: pairStats.filter(
        (pair) => (pair.leaveOneOutMaxMedianShift ?? 0) >= 30,
      ).length,
      leaveOneServiceDateOutShiftAtLeast30s: pairStats.filter(
        (pair) => (pair.leaveOneServiceDateOutMaxMedianShift ?? 0) >= 30,
      ).length,
      bootstrapWidthAtLeast60s: pairStats.filter(
        (pair) => pair.count >= 2 && pair.bootstrapMedianIntervalWidth >= 60,
      ).length,
      widestBootstrapIntervals: [...pairStats]
        .filter((pair) => pair.count >= 2)
        .sort(
          (a, b) =>
            b.bootstrapMedianIntervalWidth - a.bootstrapMedianIntervalWidth,
        )
        .slice(0, 12),
      highestDispersion: [...pairStats]
        .filter((pair) => pair.count >= 3)
        .sort(
          (a, b) =>
            (b.coefficientOfVariation ?? 0) - (a.coefficientOfVariation ?? 0),
        )
        .slice(0, 12),
      allPairs: pairStats,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
