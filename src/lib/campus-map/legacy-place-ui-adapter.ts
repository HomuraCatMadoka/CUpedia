import type {
  CampusMapAccessSchedule,
  CampusMapAudience,
  CampusMapCapability,
  CampusMapCredentialRequirement,
  CampusMapGender,
  CampusMapPinType,
  CampusMapPlaceType,
  CampusMapRegularHours,
  CampusMapReservationRequirement,
  CampusMapTemporaryStatus,
  CampusMapV2Gender,
  CampusMapV2WheelchairAccess,
  CampusMapWheelchairAccess,
} from "@/db/schema";
import { isCampusMapPinTypeV1 } from "@/lib/campus-map/controlled-values";
import type {
  CampusMapHistoricalFact,
  CampusMapHistoricalFactV1,
} from "@/lib/campus-map/fact-store";

/**
 * The V2 data contract lands before its public presentation. This is the
 * temporary boundary that lets the existing V1 detail page keep its exact UI
 * while V2 facts are collected behind the scenes.
 */
export type CampusMapLegacyPlaceFact = Omit<
  CampusMapHistoricalFactV1,
  "factSchemaVersion"
>;

export interface CampusMapLegacyV2Presentation {
  pinType: CampusMapPinType;
  capabilities: CampusMapCapability[];
  access: {
    audience: CampusMapAudience;
    credentialRequirement: CampusMapCredentialRequirement;
    schedule: CampusMapAccessSchedule;
    reservationRequirement: CampusMapReservationRequirement;
    temporaryStatus: CampusMapTemporaryStatus;
  };
  facets: {
    gender: CampusMapGender;
    wheelchairAccess: CampusMapWheelchairAccess;
  };
}

/** One compatibility projection shared by the unchanged list and detail UIs. */
export function projectCampusMapLegacyV2Presentation(input: {
  placeType: CampusMapPlaceType;
  regularHours: CampusMapRegularHours | null;
  capabilities: CampusMapCapability[];
  gender: CampusMapV2Gender | null;
  wheelchairAccess: CampusMapV2WheelchairAccess | null;
}): CampusMapLegacyV2Presentation | null {
  if (!isCampusMapPinTypeV1(input.placeType)) return null;
  return {
    pinType: input.placeType,
    capabilities: input.capabilities,
    access: {
      audience: "unknown",
      credentialRequirement: "unknown",
      schedule: input.regularHours
        ? { kind: "weekly", ...input.regularHours }
        : { kind: "unknown" },
      reservationRequirement: "unknown",
      temporaryStatus: "unknown",
    },
    facets: {
      gender: input.gender ?? "unknown",
      wheelchairAccess: input.wheelchairAccess ?? "unknown",
    },
  };
}

export function projectCampusMapLegacyPlaceFact(
  fact: CampusMapHistoricalFact,
): CampusMapLegacyPlaceFact | null {
  if (fact.factSchemaVersion === 1) return fact;
  const presentation = projectCampusMapLegacyV2Presentation(fact);
  if (!presentation) return null;

  return {
    name: fact.name,
    pinType: presentation.pinType,
    capabilities: presentation.capabilities,
    gender: presentation.facets.gender,
    wheelchairAccess: presentation.facets.wheelchairAccess,
    audience: presentation.access.audience,
    credentialRequirement: presentation.access.credentialRequirement,
    accessSchedule: presentation.access.schedule,
    reservationRequirement: presentation.access.reservationRequirement,
    temporaryStatus: presentation.access.temporaryStatus,
    buildingId: fact.buildingId,
    floorId: fact.floorId,
    locationKind: fact.locationKind,
    pointPrecision: fact.pointPrecision,
    longitude: fact.longitude,
    latitude: fact.latitude,
    coordinateCrs: fact.coordinateCrs,
    observedAt: fact.observedAt,
    verifiedAt: fact.verifiedAt,
    provenance: fact.provenance,
  };
}
