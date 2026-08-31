import type { CampusMapAccessSchedule } from "@/db/schema";
import type {
  CampusMapCurrentPlace,
  CampusMapHistoricalFact,
} from "@/lib/campus-map/fact-store";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";

type CampusMapStoredPlaceFact = Omit<
  CampusMapHistoricalFact,
  "verifiedAt" | "provenance"
>;

export type CampusMapPlaceFactSnapshot =
  | { kind: "current"; fact: CampusMapCurrentPlace }
  | { kind: "stored"; fact: CampusMapStoredPlaceFact };

export type CampusMapPlaceFactConversionResult =
  | { ok: true; fact: CampusMapPublishFactInput }
  | {
      ok: false;
      reason:
        | "invalid-building-location"
        | "invalid-floor-location"
        | "invalid-outdoor-location";
    };

/**
 * Restores a read-side Place fact to the fact portion of a publish command.
 * Operation-specific sources and idempotency data belong to the caller.
 */
export function toCampusMapRepublishableFact(
  snapshot: CampusMapPlaceFactSnapshot,
): CampusMapPlaceFactConversionResult {
  const location =
    snapshot.kind === "current"
      ? currentLocation(snapshot.fact)
      : storedLocation(snapshot.fact);
  if (!location.ok) return location;
  const values = factValues(snapshot);
  return {
    ok: true,
    fact: {
      name: values.name,
      buildingId: location.buildingId,
      floorId: location.floorId,
      pinType: values.pinType,
      capabilities: [...values.capabilities],
      gender: values.gender,
      wheelchairAccess: values.wheelchairAccess,
      audience: values.audience,
      credentialRequirement: values.credentialRequirement,
      accessSchedule: copyAccessSchedule(values.accessSchedule),
      reservationRequirement: values.reservationRequirement,
      temporaryStatus: values.temporaryStatus,
      location: location.location,
      observedAt: values.observedAt?.toISOString() ?? null,
    },
  };
}

type CampusMapPlaceFactValues = Omit<
  CampusMapPublishFactInput,
  "buildingId" | "floorId" | "location" | "observedAt"
> & { observedAt: Date | null };

function factValues(
  snapshot: CampusMapPlaceFactSnapshot,
): CampusMapPlaceFactValues {
  if (snapshot.kind === "stored") return snapshot.fact;
  const { fact } = snapshot;
  return {
    name: fact.name,
    pinType: fact.pinType,
    capabilities: fact.capabilities,
    gender: fact.facets.gender,
    wheelchairAccess: fact.facets.wheelchairAccess,
    audience: fact.access.audience,
    credentialRequirement: fact.access.credentialRequirement,
    accessSchedule: fact.access.schedule,
    reservationRequirement: fact.access.reservationRequirement,
    temporaryStatus: fact.access.temporaryStatus,
    observedAt: fact.observedAt,
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

function currentLocation(fact: CampusMapCurrentPlace): ConvertedLocation {
  if (fact.location.kind === "building") {
    return {
      ok: true,
      buildingId: fact.location.building.id,
      floorId: null,
      location: { kind: "building" },
    };
  }
  if (fact.location.kind === "floor") {
    return {
      ok: true,
      buildingId: fact.location.building.id,
      floorId: fact.location.floor.id,
      location: { kind: "floor" },
    };
  }
  return {
    ok: true,
    buildingId: null,
    floorId: null,
    location: { kind: "outdoor-point", ...fact.location.point },
  };
}

function storedLocation(fact: CampusMapStoredPlaceFact): ConvertedLocation {
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

function copyAccessSchedule(
  schedule: CampusMapAccessSchedule,
): CampusMapAccessSchedule {
  if (schedule.kind !== "weekly") return { kind: schedule.kind };
  return {
    kind: "weekly",
    timezone: schedule.timezone,
    intervals: schedule.intervals.map((interval) => ({
      days: [...interval.days],
      opensAt: interval.opensAt,
      closesAt: interval.closesAt,
    })),
  };
}
