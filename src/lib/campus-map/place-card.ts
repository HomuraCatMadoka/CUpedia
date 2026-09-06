import type {
  CampusMapCapability,
  CampusMapOfficialAction,
  CampusMapPlaceType,
  CampusMapProvenanceKind,
  CampusMapRegularHours,
  CampusMapV2Gender,
  CampusMapV2WheelchairAccess,
} from "@/db/schema";
import {
  campusMapDisplayOptionLabel,
  campusMapFactFieldLabel,
  campusMapPlaceTypeLabel,
  campusMapProvenanceKindLabel,
  CAMPUS_MAP_DISPLAY_REGISTRY,
} from "@/lib/campus-map/display-registry";
import { isCampusMapOfficialAction } from "@/lib/campus-map/official-action";

type CampusMapPlaceCardFactKey =
  | "regularHours"
  | "visitNote"
  | "capabilities"
  | "gender"
  | "wheelchairAccess";

interface CampusMapPlaceCardSource {
  kind: CampusMapProvenanceKind;
  accessedOn: string;
  observedAt: Date | string | null;
  hasLocationEvidence: boolean;
}

interface CampusMapPlaceCardInput {
  placeType: CampusMapPlaceType;
  locationLabel: string;
  regularHours: CampusMapRegularHours | null;
  officialActions: readonly CampusMapOfficialAction[];
  visitNote: string | null;
  capabilities: readonly CampusMapCapability[];
  gender: CampusMapV2Gender | null;
  wheelchairAccess: CampusMapV2WheelchairAccess | null;
  observedAt: Date | string | null;
  verifiedAt: Date | string | null;
  provenance: readonly CampusMapPlaceCardSource[];
}

interface CampusMapPlaceCardFact {
  key: CampusMapPlaceCardFactKey;
  label: string;
  value: string;
}

export interface CampusMapPlaceCardProjection {
  placeTypeLabel: string;
  locationLabel: string;
  locationIsPrimary: boolean;
  primaryFact: CampusMapPlaceCardFact | null;
  detailFacts: readonly CampusMapPlaceCardFact[];
  officialActions: ReadonlyArray<
    CampusMapOfficialAction & {
      destination: string;
    }
  >;
  verification: readonly string[];
  sources: readonly string[];
}

const WEEKDAY_ORDER = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

const PRIMARY_FACT_PRIORITY: Record<
  CampusMapPlaceType,
  CampusMapPlaceCardFactKey[]
> = {
  toilet: ["gender", "wheelchairAccess", "visitNote", "regularHours"],
  water: ["visitNote", "wheelchairAccess", "regularHours"],
  printer: ["capabilities", "visitNote", "regularHours"],
  "common-space": ["visitNote", "regularHours", "wheelchairAccess"],
  classroom: [],
  "sports-facility": ["regularHours", "visitNote", "wheelchairAccess"],
  "health-service": ["regularHours", "visitNote", "wheelchairAccess"],
  "vending-machine": ["visitNote", "regularHours", "wheelchairAccess"],
};

const HONG_KONG_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function weekdayGroupLabel(
  days: CampusMapRegularHours["intervals"][number]["days"],
) {
  const positions = days.map((day) => WEEKDAY_ORDER.indexOf(day));
  const isContiguous = positions.every(
    (position, index) => index === 0 || position === positions[index - 1]! + 1,
  );
  if (days.length >= 3 && isContiguous) {
    return `${CAMPUS_MAP_DISPLAY_REGISTRY.weekdays[days[0]!]}至${
      CAMPUS_MAP_DISPLAY_REGISTRY.weekdays[days.at(-1)!]
    }`;
  }
  return days
    .map((day) => CAMPUS_MAP_DISPLAY_REGISTRY.weekdays[day])
    .join("、");
}

function formatCampusMapRegularHours(hours: CampusMapRegularHours) {
  return hours.intervals
    .map(
      (interval) =>
        `${weekdayGroupLabel(interval.days)} ${interval.opensAt}–${interval.closesAt}`,
    )
    .join("；");
}

function knownDate(value: Date | string | null) {
  if (value === null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    HONG_KONG_DATE_FORMATTER.formatToParts(date).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function officialActionDestination(url: string) {
  if (/^tel:/iu.test(url)) return `电话 ${url.slice(4)}`;
  if (/^mailto:/iu.test(url)) return url.slice(7);
  return new URL(url).hostname.replace(/^www\./iu, "");
}

function isBookingAction(action: CampusMapOfficialAction) {
  return /预约|預約|booking|appointment/iu.test(action.label);
}

function knownFacts(input: CampusMapPlaceCardInput) {
  const facts: CampusMapPlaceCardFact[] = [];
  if (input.regularHours) {
    facts.push({
      key: "regularHours",
      label: campusMapFactFieldLabel("regularHours"),
      value: formatCampusMapRegularHours(input.regularHours),
    });
  }
  if (input.visitNote?.trim()) {
    facts.push({
      key: "visitNote",
      label: campusMapFactFieldLabel("visitNote"),
      value: input.visitNote.trim(),
    });
  }
  if (input.capabilities.length > 0) {
    facts.push({
      key: "capabilities",
      label: campusMapFactFieldLabel("capabilities"),
      value: input.capabilities
        .map((value) => campusMapDisplayOptionLabel("capabilities", value))
        .join("、"),
    });
  }
  if (input.gender) {
    facts.push({
      key: "gender",
      label: campusMapFactFieldLabel("gender"),
      value: campusMapDisplayOptionLabel("gender", input.gender),
    });
  }
  if (input.wheelchairAccess) {
    facts.push({
      key: "wheelchairAccess",
      label: campusMapFactFieldLabel("wheelchairAccess"),
      value: campusMapDisplayOptionLabel(
        "wheelchairAccess",
        input.wheelchairAccess,
      ),
    });
  }
  return facts;
}

function primaryFactKey(
  placeType: CampusMapPlaceType,
  facts: readonly CampusMapPlaceCardFact[],
) {
  return PRIMARY_FACT_PRIORITY[placeType].find((key) =>
    facts.some((fact) => fact.key === key),
  );
}

/** One projection owns compact-card priority, action limits, and known-only detail. */
export function projectCampusMapPlaceCard(
  input: CampusMapPlaceCardInput,
): CampusMapPlaceCardProjection {
  const facts = knownFacts(input);
  const primaryKey = primaryFactKey(input.placeType, facts);
  const primaryFact = facts.find((fact) => fact.key === primaryKey) ?? null;
  const safeActions = input.officialActions.filter(isCampusMapOfficialAction);
  const prioritizedActions =
    input.placeType === "health-service"
      ? safeActions.sort(
          (left, right) =>
            Number(isBookingAction(right)) - Number(isBookingAction(left)),
        )
      : safeActions;
  const observedOn = knownDate(input.observedAt);
  const verifiedOn = knownDate(input.verifiedAt);

  return {
    placeTypeLabel: campusMapPlaceTypeLabel(input.placeType),
    locationLabel: input.locationLabel,
    locationIsPrimary: input.placeType === "classroom",
    primaryFact,
    detailFacts: facts.filter((fact) => fact.key !== primaryFact?.key),
    officialActions: prioritizedActions.slice(0, 2).map((action) => ({
      ...action,
      destination: officialActionDestination(action.url),
    })),
    verification: [
      observedOn ? `资料观察于 ${observedOn}` : null,
      verifiedOn ? `核对于 ${verifiedOn}` : null,
    ].filter((value): value is string => value !== null),
    sources: input.provenance.map((source) => {
      const observed = knownDate(source.observedAt);
      return [
        campusMapProvenanceKindLabel(source.kind),
        `查阅于 ${source.accessedOn}`,
        observed ? `观察于 ${observed}` : null,
        source.hasLocationEvidence ? "含位置依据" : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }),
  };
}
