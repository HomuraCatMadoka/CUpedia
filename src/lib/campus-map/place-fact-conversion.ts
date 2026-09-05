import {
  CAMPUS_MAP_PLACE_TYPES,
  isCampusMapPinTypeV1,
} from "@/lib/campus-map/controlled-values";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";
import type { CampusMapAppendFact } from "@/lib/campus-map/fact-store-transaction";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";

export type CampusMapPlaceFactSnapshot =
  | { kind: "current"; fact: CampusMapCurrentPlace }
  | {
      kind: "stored";
      factSchemaVersion: number;
      fact: CampusMapAppendFact;
    };

export type CampusMapPlaceFactConversionResult =
  | { ok: true; fact: CampusMapPublishFactInput }
  | {
      ok: false;
      reason:
        | "invalid-building-location"
        | "invalid-floor-location"
        | "invalid-outdoor-location"
        | "unsupported-schema-version"
        | "invalid-schema-payload";
    };

/**
 * Converts a read-side snapshot into the active V2 publish contract. V1 is
 * upgraded field-by-field; it is never re-labelled as a V2 payload in place.
 */
export function toCampusMapRepublishableFact(
  snapshot: CampusMapPlaceFactSnapshot,
): CampusMapPlaceFactConversionResult {
  if (snapshot.kind === "current") {
    return { ok: true, fact: copyCurrentFact(snapshot.fact) };
  }
  const location = storedLocation(snapshot.fact);
  if (!location.ok) return location;
  if (snapshot.factSchemaVersion === 1) {
    return upgradeV1Fact(snapshot.fact, location);
  }
  if (snapshot.factSchemaVersion !== 2) {
    return { ok: false, reason: "unsupported-schema-version" };
  }
  return restoreV2Fact(snapshot.fact, location);
}

function copyCurrentFact(
  fact: CampusMapCurrentPlace,
): CampusMapPublishFactInput {
  const location =
    fact.location.kind === "building"
      ? ({ kind: "building" } as const)
      : fact.location.kind === "floor"
        ? ({ kind: "floor" } as const)
        : ({ kind: "outdoor-point", ...fact.location.point } as const);
  return {
    name: fact.name,
    buildingId:
      fact.location.kind === "building" || fact.location.kind === "floor"
        ? fact.location.building.id
        : null,
    floorId: fact.location.kind === "floor" ? fact.location.floor.id : null,
    placeType: fact.placeType,
    regularHours: copyRegularHours(fact.regularHours),
    officialActions: fact.officialActions.map((action) => ({ ...action })),
    visitNote: fact.visitNote,
    capabilities: [...fact.capabilities],
    gender: fact.gender,
    wheelchairAccess: fact.wheelchairAccess,
    location,
    observedAt: fact.observedAt?.toISOString() ?? null,
  };
}

type ConvertedLocation =
  | {
      ok: true;
      buildingId: string | null;
      floorId: string | null;
      location: CampusMapPublishFactInput["location"];
    }
  | Extract<CampusMapPlaceFactConversionResult, { ok: false }>;

function storedLocation(fact: CampusMapAppendFact): ConvertedLocation {
  if (fact.locationKind === "building") {
    return fact.buildingId !== null && fact.floorId === null
      ? {
          ok: true,
          buildingId: fact.buildingId,
          floorId: null,
          location: { kind: "building" },
        }
      : { ok: false, reason: "invalid-building-location" };
  }
  if (fact.locationKind === "floor") {
    return fact.buildingId !== null && fact.floorId !== null
      ? {
          ok: true,
          buildingId: fact.buildingId,
          floorId: fact.floorId,
          location: { kind: "floor" },
        }
      : { ok: false, reason: "invalid-floor-location" };
  }
  if (
    fact.buildingId !== null ||
    fact.floorId !== null ||
    fact.longitude === null ||
    fact.latitude === null ||
    fact.coordinateCrs !== "wgs84" ||
    fact.pointPrecision === null
  ) {
    return { ok: false, reason: "invalid-outdoor-location" };
  }
  return {
    ok: true,
    buildingId: null,
    floorId: null,
    location: {
      kind: "outdoor-point",
      longitude: fact.longitude,
      latitude: fact.latitude,
      crs: fact.coordinateCrs,
      precision: fact.pointPrecision,
    },
  };
}

function upgradeV1Fact(
  fact: CampusMapAppendFact,
  location: Extract<ConvertedLocation, { ok: true }>,
): CampusMapPlaceFactConversionResult {
  if (
    !isCampusMapPinTypeV1(fact.pinType) ||
    fact.gender === null ||
    fact.wheelchairAccess === null ||
    fact.temporaryStatus === null ||
    fact.regularHours !== null ||
    fact.officialActions.length !== 0 ||
    fact.visitNote !== null
  ) {
    return { ok: false, reason: "invalid-schema-payload" };
  }
  return {
    ok: true,
    fact: {
      name: fact.name,
      buildingId: location.buildingId,
      floorId: location.floorId,
      placeType: fact.pinType,
      regularHours:
        fact.accessSchedule.kind === "weekly"
          ? {
              timezone: fact.accessSchedule.timezone,
              intervals: fact.accessSchedule.intervals.map((interval) => ({
                days: [...interval.days],
                opensAt: interval.opensAt,
                closesAt: interval.closesAt,
              })),
            }
          : null,
      officialActions: [],
      visitNote: null,
      capabilities: fact.pinType === "printer" ? [...fact.capabilities] : [],
      gender:
        fact.pinType === "toilet" && fact.gender !== "unknown"
          ? fact.gender
          : null,
      wheelchairAccess:
        fact.wheelchairAccess === "unknown" ? null : fact.wheelchairAccess,
      location: location.location,
      observedAt: fact.observedAt?.toISOString() ?? null,
    },
  };
}

function restoreV2Fact(
  fact: CampusMapAppendFact,
  location: Extract<ConvertedLocation, { ok: true }>,
): CampusMapPlaceFactConversionResult {
  if (
    !CAMPUS_MAP_PLACE_TYPES.some((value) => value === fact.pinType) ||
    fact.audience !== "unknown" ||
    fact.credentialRequirement !== "unknown" ||
    fact.accessSchedule.kind !== "unknown" ||
    fact.reservationRequirement !== "unknown" ||
    fact.gender === "unknown" ||
    fact.wheelchairAccess === "unknown" ||
    fact.temporaryStatus !== null
  ) {
    return { ok: false, reason: "invalid-schema-payload" };
  }
  return {
    ok: true,
    fact: {
      name: fact.name,
      buildingId: location.buildingId,
      floorId: location.floorId,
      placeType: fact.pinType,
      regularHours: copyRegularHours(fact.regularHours),
      officialActions: fact.officialActions.map((action) => ({ ...action })),
      visitNote: fact.visitNote,
      capabilities: [...fact.capabilities],
      gender: fact.gender,
      wheelchairAccess: fact.wheelchairAccess,
      location: location.location,
      observedAt: fact.observedAt?.toISOString() ?? null,
    },
  };
}

function copyRegularHours(
  hours: CampusMapPublishFactInput["regularHours"],
): CampusMapPublishFactInput["regularHours"] {
  return hours
    ? {
        timezone: hours.timezone,
        intervals: hours.intervals.map((interval) => ({
          days: [...interval.days],
          opensAt: interval.opensAt,
          closesAt: interval.closesAt,
        })),
      }
    : null;
}
