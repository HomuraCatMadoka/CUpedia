import type {
  CampusMapAccessSchedule,
  CampusMapAudience,
  CampusMapCapability,
  CampusMapCoordinateConversionMethod,
  CampusMapCredentialRequirement,
  CampusMapGender,
  CampusMapPinType,
  CampusMapPointPrecision,
  CampusMapProvenanceKind,
  CampusMapReservationRequirement,
  CampusMapRightsStatus,
  CampusMapSourceCoordinateCrs,
  CampusMapTemporaryStatus,
  CampusMapWheelchairAccess,
} from "@/db/schema";
import {
  CAMPUS_MAP_AUDIENCES,
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
  CAMPUS_MAP_CREDENTIAL_REQUIREMENTS,
  CAMPUS_MAP_GENDERS,
  CAMPUS_MAP_PIN_TYPES,
  CAMPUS_MAP_PROVENANCE_KINDS,
  CAMPUS_MAP_RESERVATION_REQUIREMENTS,
  CAMPUS_MAP_RIGHTS_STATUSES,
  CAMPUS_MAP_SOURCE_COORDINATE_CRS,
  CAMPUS_MAP_TEMPORARY_STATUSES,
  CAMPUS_MAP_WHEELCHAIR_ACCESS,
} from "./controlled-values";

/** Runtime values shared by publish clients and versioned snapshot codecs. */
export const CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES = {
  pinType: CAMPUS_MAP_PIN_TYPES,
  capability: CAMPUS_MAP_CAPABILITIES,
  gender: CAMPUS_MAP_GENDERS,
  wheelchairAccess: CAMPUS_MAP_WHEELCHAIR_ACCESS,
  audience: CAMPUS_MAP_AUDIENCES,
  credentialRequirement: CAMPUS_MAP_CREDENTIAL_REQUIREMENTS,
  reservationRequirement: CAMPUS_MAP_RESERVATION_REQUIREMENTS,
  temporaryStatus: CAMPUS_MAP_TEMPORARY_STATUSES,
  provenanceKind: CAMPUS_MAP_PROVENANCE_KINDS,
  rightsStatus: CAMPUS_MAP_RIGHTS_STATUSES,
  sourceCoordinateCrs: CAMPUS_MAP_SOURCE_COORDINATE_CRS,
  coordinateConversionMethod: CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
} as const satisfies {
  pinType: readonly CampusMapPinType[];
  capability: readonly CampusMapCapability[];
  gender: readonly CampusMapGender[];
  wheelchairAccess: readonly CampusMapWheelchairAccess[];
  audience: readonly CampusMapAudience[];
  credentialRequirement: readonly CampusMapCredentialRequirement[];
  reservationRequirement: readonly CampusMapReservationRequirement[];
  temporaryStatus: readonly CampusMapTemporaryStatus[];
  provenanceKind: readonly CampusMapProvenanceKind[];
  rightsStatus: readonly CampusMapRightsStatus[];
  sourceCoordinateCrs: readonly CampusMapSourceCoordinateCrs[];
  coordinateConversionMethod: readonly CampusMapCoordinateConversionMethod[];
};

export interface CampusMapPublishFactInput {
  name: string;
  buildingId: string | null;
  floorId: string | null;
  pinType: CampusMapPinType;
  capabilities: CampusMapCapability[];
  gender: CampusMapGender;
  wheelchairAccess: CampusMapWheelchairAccess;
  audience: CampusMapAudience;
  credentialRequirement: CampusMapCredentialRequirement;
  accessSchedule: CampusMapAccessSchedule;
  reservationRequirement: CampusMapReservationRequirement;
  temporaryStatus: CampusMapTemporaryStatus;
  location:
    | { kind: "building" }
    | { kind: "floor" }
    | {
        kind: "outdoor-point";
        longitude: number;
        latitude: number;
        crs: "wgs84";
        precision: CampusMapPointPrecision;
      };
  observedAt: string | null;
}

export interface CampusMapPublishSourceInput {
  kind: CampusMapProvenanceKind;
  ref: string;
  url: string | null;
  owner: string | null;
  version: string | null;
  snapshotHash: string | null;
  accessedOn: string;
  observedAt: string | null;
  rightsStatus: CampusMapRightsStatus;
  limitations: string | null;
  note: string | null;
  sourceCoordinate: {
    x: number;
    y: number;
    crs: CampusMapSourceCoordinateCrs;
    conversion: {
      method: CampusMapCoordinateConversionMethod;
      version: string;
    } | null;
  } | null;
}

export type CampusMapPublishChange =
  | {
      operation: "create";
      fact: CampusMapPublishFactInput;
      sources: CampusMapPublishSourceInput[];
    }
  | {
      operation: "update" | "restore";
      placeId: string;
      baseRevisionId: string;
      fact: CampusMapPublishFactInput;
      sources: CampusMapPublishSourceInput[];
    }
  | {
      operation: "retire";
      placeId: string;
      baseRevisionId: string;
      sources: CampusMapPublishSourceInput[];
      /** @internal A historical snapshot supplied only for an audited revert. */
      fact?: CampusMapPublishFactInput;
    }
  /** @internal Submitted only by the server-authorized fact governance seam. */
  | {
      operation: "merge";
      placeId: string;
      baseRevisionId: string;
      mergedIntoPlaceId: string;
      sources: CampusMapPublishSourceInput[];
    };

export interface CampusMapPublishCommand {
  kind: "single" | "bulk";
  idempotencyKey: string;
  comment: string;
  sourceSummary: string;
  reviewRequested: boolean;
  client: { name: string; version: string };
  warningAcknowledgements: Array<{
    changeIndex: number;
    code: string;
    fingerprint: string;
  }>;
  changes: CampusMapPublishChange[];
}

export interface CampusMapPublishContext {
  actorId: string | null;
  clientIp: string;
}

export interface CampusMapPublishIssueAnchor {
  changeIndex?: number;
  placeId?: string;
  field?: string;
}

export interface CampusMapPublishValidationIssue {
  code: string;
  anchor: CampusMapPublishIssueAnchor;
}

export interface CampusMapPublishWarning extends CampusMapPublishValidationIssue {
  fingerprint: string;
}

export interface CampusMapPublishSafeSnapshot extends CampusMapPublishFactInput {
  factSchemaVersion: number;
}

export type CampusMapPublishResult =
  | {
      status: "published";
      changesetId: string;
      changes: Array<{ placeId: string; revisionId: string }>;
      warnings: CampusMapPublishWarning[];
      suggestions: CampusMapPublishValidationIssue[];
    }
  | {
      status: "conflict";
      code: "base-revision-conflict";
      conflicts: Array<{
        code: "base-revision-conflict";
        anchor: CampusMapPublishIssueAnchor;
        placeId: string;
        expectedRevisionId: string;
        currentRevisionId: string | null;
        currentStatus: "active" | "retired" | "merged" | null;
        currentSnapshot: CampusMapPublishSafeSnapshot | null;
      }>;
    }
  | {
      status: "rate-limited";
      code: "publish-rate-limit";
      scope: "actor" | "ip";
      policy: "burst" | "sustained";
      retryAfter: number;
    }
  | {
      status: "authentication-required";
      code: "authentication-required";
    }
  | {
      status: "forbidden";
      code:
        | "actor-not-eligible"
        | "actor-banned"
        | "profile-incomplete"
        | "role-not-eligible"
        | "admin-required";
    }
  | {
      status: "temporarily-unavailable";
      code: "publish-unavailable";
      retryable: true;
    }
  | {
      status: "validation-failed";
      errors: CampusMapPublishValidationIssue[];
      warnings: CampusMapPublishWarning[];
      suggestions: CampusMapPublishValidationIssue[];
    };
