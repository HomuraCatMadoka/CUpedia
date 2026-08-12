import type { GeoJSONSourceSpecification } from "maplibre-gl";

export const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";

export type LngLat = readonly [longitude: number, latitude: number];

export type CampusBusStop = {
  id: string;
  stopId: string;
  sequence: number;
  nameEn: string;
  nameZhHant: string;
  partialService: boolean;
};

export type CampusBusPattern = {
  id: string;
  revisionId: string;
  confidence: string;
  sourceRefs: string[];
  departureMinutes: number[];
  serviceDayType: string;
  projections: Array<{
    stopOccurrenceId: string;
    p50Seconds: number;
    p10Seconds: number | null;
    p90Seconds: number | null;
    sourceKind: string;
    sourceRefs: string[];
    sampleCount: number;
    serviceDayCount: number | null;
    fallbackLevel: string;
    offsetConfidence: string;
    publicationStatus: "staging_only";
    evidence: {
      segmentCount: number;
      segmentSamplesTotal: number;
      bottleneckSampleCount: number;
      serviceDayCount: number | null;
      routeScope: string;
      containsReviewMatch: boolean;
      segmentSourceRefs: string[];
    };
    timeBandAdjustments?: Array<{
      residualSeconds: number;
      timeBand: CampusBusPredictionTimeBand;
    }>;
  }>;
};

export type CampusBusPredictionTimeBand =
  | "morning_peak"
  | "midday"
  | "evening_peak"
  | "night"
  | "all_day";

export type CampusBusServiceDayRule =
  | "daily"
  | "monday_friday_teaching_days"
  | "monday_saturday_except_public_holidays"
  | "saturday_teaching_days"
  | "sunday_and_public_holidays";

export type CampusBusServiceBand = {
  endMinutes: number;
  serviceDayRule: CampusBusServiceDayRule;
  serviceRuleRaw: string;
  startMinutes: number;
};

export type CampusBusRouteMap = {
  attribution: string;
  geometry: GeoJSONSourceSpecification["data"];
  sourceUrl: string;
  stopCoordinates: Record<string, LngLat>;
};

export type CampusBusRoute = {
  academicTerms: Array<{ startDate: string; endDate: string }>;
  code: string;
  datasetId: string;
  datasetProvenance: {
    parserVersion: string;
    snapshotGeneratedAt: string;
    snapshotSha256: string;
    communityPriorSha256?: string;
  };
  seedModelRevisionId: string;
  defaultStopId: string;
  frequencyLabel: string;
  map: CampusBusRouteMap;
  officialUrl: string;
  patterns: CampusBusPattern[];
  predictionRevisionId?: string;
  publicHolidayDates: string[];
  readingWeeks: Array<{ startDate: string; endDate: string }>;
  routeId: string;
  routeNameEn: string;
  routeNameZhHant: string;
  serviceBands: CampusBusServiceBand[];
  serviceHoursLabel: string;
  slug: string;
  status: "staging_only";
  stops: CampusBusStop[];
  subtitle: string;
};

type CampusBusPassengerProjection = Pick<
  CampusBusPattern["projections"][number],
  "p50Seconds" | "stopOccurrenceId" | "timeBandAdjustments"
>;

type CampusBusPassengerPattern = Pick<
  CampusBusPattern,
  "departureMinutes" | "id" | "serviceDayType"
> & {
  projections: CampusBusPassengerProjection[];
};

export type CampusBusPassengerRoute = Pick<
  CampusBusRoute,
  | "academicTerms"
  | "code"
  | "defaultStopId"
  | "frequencyLabel"
  | "map"
  | "publicHolidayDates"
  | "readingWeeks"
  | "routeId"
  | "routeNameZhHant"
  | "serviceBands"
  | "serviceHoursLabel"
  | "slug"
  | "stops"
  | "subtitle"
> & {
  patterns: CampusBusPassengerPattern[];
};

export function toCampusBusPassengerRoute(
  route: CampusBusRoute,
): CampusBusPassengerRoute {
  return {
    academicTerms: route.academicTerms,
    code: route.code,
    defaultStopId: route.defaultStopId,
    frequencyLabel: route.frequencyLabel,
    map: route.map,
    patterns: route.patterns.map((pattern) => ({
      departureMinutes: pattern.departureMinutes,
      id: pattern.id,
      projections: pattern.projections.map((projection) => ({
        p50Seconds: projection.p50Seconds,
        stopOccurrenceId: projection.stopOccurrenceId,
        timeBandAdjustments: projection.timeBandAdjustments,
      })),
      serviceDayType: pattern.serviceDayType,
    })),
    publicHolidayDates: route.publicHolidayDates,
    readingWeeks: route.readingWeeks,
    routeId: route.routeId,
    routeNameZhHant: route.routeNameZhHant,
    serviceBands: route.serviceBands,
    serviceHoursLabel: route.serviceHoursLabel,
    slug: route.slug,
    stops: route.stops,
    subtitle: route.subtitle,
  };
}

export type CampusBusArrival = {
  arrivalAt: number;
  arrivalTime: string;
  departureAt: number;
  departureTime: string;
  patternId: string;
  waitMinutes: number;
};

export type CampusBusStopBoard = {
  firstArrivalTime: string | null;
  lastArrivalTime: string | null;
  serviceStatus:
    | "before_service"
    | "in_service"
    | "after_service"
    | "not_service_day";
  skippedDepartureTimes: string[];
  upcomingArrivals: CampusBusArrival[];
};

type HongKongDateParts = {
  dateKey: string;
  day: number;
  hour: number;
  minute: number;
  month: number;
  weekday: number;
  year: number;
};

const hktDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: HONG_KONG_TIME_ZONE,
  weekday: "short",
  year: "numeric",
});

const hktTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: HONG_KONG_TIME_ZONE,
});

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const PRE_SERVICE_COUNTDOWN_WINDOW_MILLISECONDS = 60 * 60_000;

function getHongKongDateParts(timestamp: number): HongKongDateParts {
  const parts = hktDateTimeFormatter.formatToParts(timestamp);
  const textValues = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(textValues.year);
  const month = Number(textValues.month);
  const day = Number(textValues.day);

  return {
    dateKey: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    day,
    hour: Number(textValues.hour) === 24 ? 0 : Number(textValues.hour),
    minute: Number(textValues.minute),
    month,
    weekday: weekdayIndex[textValues.weekday] ?? 0,
    year,
  };
}

export function getHongKongDateKey(timestamp: number) {
  return getHongKongDateParts(timestamp).dateKey;
}

export function hongKongWallTimeToEpoch(
  parts: Pick<HongKongDateParts, "day" | "month" | "year"> & {
    hour: number;
    minute: number;
  },
) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour - 8,
    parts.minute,
  );
}

export function formatHongKongTime(timestamp: number) {
  return hktTimeFormatter.format(timestamp);
}

export function getCampusBusPredictionTimeBand(
  timestamp: number,
): Exclude<CampusBusPredictionTimeBand, "all_day"> {
  const hour = getHongKongDateParts(timestamp).hour;
  if (hour < 10) return "morning_peak";
  if (hour < 16) return "midday";
  if (hour < 19) return "evening_peak";
  return "night";
}

function projectionResidualSeconds(
  projection: CampusBusPassengerProjection,
  departureAt: number,
) {
  const timeBand = getCampusBusPredictionTimeBand(departureAt);
  return (
    projection.timeBandAdjustments?.find(
      (adjustment) => adjustment.timeBand === timeBand,
    )?.residualSeconds ??
    projection.timeBandAdjustments?.find(
      (adjustment) => adjustment.timeBand === "all_day",
    )?.residualSeconds ??
    0
  );
}

function isTeachingDay(dateKey: string, route: CampusBusPassengerRoute) {
  const withinTerm = route.academicTerms.some(
    (term) => dateKey >= term.startDate && dateKey <= term.endDate,
  );
  const withinReadingWeek = route.readingWeeks.some(
    (week) => dateKey >= week.startDate && dateKey <= week.endDate,
  );
  return withinTerm && !withinReadingWeek;
}

function serviceBandRuns(
  band: CampusBusServiceBand,
  date: HongKongDateParts,
  route: CampusBusPassengerRoute,
) {
  const publicHoliday = route.publicHolidayDates.includes(date.dateKey);
  const teachingDay = isTeachingDay(date.dateKey, route);

  switch (band.serviceDayRule) {
    case "daily":
      return true;
    case "monday_friday_teaching_days":
      return date.weekday >= 1 && date.weekday <= 5 && teachingDay;
    case "monday_saturday_except_public_holidays":
      return date.weekday >= 1 && date.weekday <= 6 && !publicHoliday;
    case "saturday_teaching_days":
      return date.weekday === 6 && teachingDay;
    case "sunday_and_public_holidays":
      return date.weekday === 0 || publicHoliday;
  }
}

function formatMinutesOfDay(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

export function getCampusBusServiceHoursLabel(
  route: CampusBusPassengerRoute,
  now: number,
) {
  const date = getHongKongDateParts(now);
  const activeBands = route.serviceBands.filter((band) =>
    serviceBandRuns(band, date, route),
  );
  if (activeBands.length === 0) return null;

  const startMinutes = Math.min(
    ...activeBands.map((band) => band.startMinutes),
  );
  const endMinutes = Math.max(...activeBands.map((band) => band.endMinutes));
  return `${formatMinutesOfDay(startMinutes)}-${formatMinutesOfDay(endMinutes)}`;
}

function activePatternDayTypes(
  date: HongKongDateParts,
  route: CampusBusPassengerRoute,
) {
  return new Set([
    "scheduled_service_day",
    isTeachingDay(date.dateKey, route) ? "teaching_day" : "non_teaching_day",
  ]);
}

function scheduledDeparturesForDate(
  now: number,
  route: CampusBusPassengerRoute,
) {
  const date = getHongKongDateParts(now);
  const patternDayTypes = activePatternDayTypes(date, route);
  const departures: Array<{
    departureAt: number;
    pattern: CampusBusPassengerPattern;
  }> = [];

  for (const band of route.serviceBands) {
    if (!serviceBandRuns(band, date, route)) continue;
    for (
      let minuteOfDay = band.startMinutes;
      minuteOfDay <= band.endMinutes;
      minuteOfDay += 1
    ) {
      const minute = minuteOfDay % 60;
      const pattern = route.patterns.find(
        (candidate) =>
          patternDayTypes.has(candidate.serviceDayType) &&
          candidate.departureMinutes.includes(minute),
      );
      if (!pattern) continue;
      departures.push({
        departureAt: hongKongWallTimeToEpoch({
          ...date,
          hour: Math.floor(minuteOfDay / 60),
          minute,
        }),
        pattern,
      });
    }
  }

  return departures
    .sort((left, right) => left.departureAt - right.departureAt)
    .filter(
      (departure, index, all) =>
        index === 0 ||
        departure.departureAt !== all[index - 1].departureAt ||
        departure.pattern.id !== all[index - 1].pattern.id,
    );
}

export function getCampusBusScheduledArrivals(
  route: CampusBusPassengerRoute,
  stopOccurrenceId: string,
  serviceDateTimestamp: number,
) {
  return scheduledDeparturesForDate(serviceDateTimestamp, route).flatMap(
    ({ departureAt, pattern }) => {
      const projection = pattern.projections.find(
        (candidate) => candidate.stopOccurrenceId === stopOccurrenceId,
      );
      if (!projection) return [];
      const arrivalAt =
        departureAt +
        (projection.p50Seconds +
          projectionResidualSeconds(projection, departureAt)) *
          1_000;
      return [
        {
          arrivalAt,
          arrivalTime: formatHongKongTime(arrivalAt),
          departureAt,
          departureTime: formatHongKongTime(departureAt),
          patternId: pattern.id,
          waitMinutes: Math.max(
            0,
            Math.ceil((arrivalAt - serviceDateTimestamp) / 60_000),
          ),
        } satisfies CampusBusArrival,
      ];
    },
  );
}

export function getCampusBusStopBoard(
  route: CampusBusPassengerRoute,
  stopOccurrenceId: string,
  now: number,
): CampusBusStopBoard {
  const departures = scheduledDeparturesForDate(now, route);
  if (departures.length === 0) {
    return {
      firstArrivalTime: null,
      lastArrivalTime: null,
      serviceStatus: "not_service_day",
      skippedDepartureTimes: [],
      upcomingArrivals: [],
    };
  }

  const servingArrivals = departures.flatMap(({ departureAt, pattern }) => {
    const projection = pattern.projections.find(
      (candidate) => candidate.stopOccurrenceId === stopOccurrenceId,
    );
    if (!projection) return [];
    const arrivalAt =
      departureAt +
      (projection.p50Seconds +
        projectionResidualSeconds(projection, departureAt)) *
        1_000;
    const millisecondsUntilArrival = arrivalAt - now;
    return [
      {
        arrivalAt,
        arrivalTime: formatHongKongTime(arrivalAt),
        departureAt,
        departureTime: formatHongKongTime(departureAt),
        patternId: pattern.id,
        waitMinutes:
          millisecondsUntilArrival < 60_000
            ? 0
            : Math.ceil(millisecondsUntilArrival / 60_000),
      },
    ];
  });

  const firstArrival = servingArrivals[0];
  const lastArrival = servingArrivals.at(-1);
  const serviceStatus =
    !firstArrival || now < firstArrival.arrivalAt
      ? "before_service"
      : !lastArrival || now > lastArrival.arrivalAt
        ? "after_service"
        : "in_service";
  const showUpcomingArrivals =
    serviceStatus === "in_service" ||
    (serviceStatus === "before_service" &&
      firstArrival !== undefined &&
      firstArrival.arrivalAt - now <=
        PRE_SERVICE_COUNTDOWN_WINDOW_MILLISECONDS);
  const upcomingArrivals = showUpcomingArrivals
    ? servingArrivals.filter((arrival) => arrival.arrivalAt >= now).slice(0, 3)
    : [];
  const latestVisibleArrival = upcomingArrivals.at(-1)?.arrivalAt ?? Infinity;
  const skippedDepartureTimes = departures
    .filter(({ departureAt, pattern }) => {
      if (departureAt < now || departureAt > latestVisibleArrival) return false;
      return !pattern.projections.some(
        (projection) => projection.stopOccurrenceId === stopOccurrenceId,
      );
    })
    .slice(0, 2)
    .map(({ departureAt }) => formatHongKongTime(departureAt));

  return {
    firstArrivalTime: firstArrival?.arrivalTime ?? null,
    lastArrivalTime: lastArrival?.arrivalTime ?? null,
    serviceStatus,
    skippedDepartureTimes,
    upcomingArrivals,
  };
}
