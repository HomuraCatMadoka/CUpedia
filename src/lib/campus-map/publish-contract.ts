import type {
  CampusMapCapability,
  CampusMapCoordinateConversionMethod,
  CampusMapOfficialAction,
  CampusMapPlaceType,
  CampusMapPointPrecision,
  CampusMapProvenanceKind,
  CampusMapRegularHours,
  CampusMapRightsStatus,
  CampusMapSourceCoordinateCrs,
  CampusMapV2Gender,
  CampusMapV2WheelchairAccess,
} from "@/db/schema";
import {
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
  CAMPUS_MAP_PLACE_TYPES,
  CAMPUS_MAP_PROVENANCE_KINDS,
  CAMPUS_MAP_RIGHTS_STATUSES,
  CAMPUS_MAP_SOURCE_COORDINATE_CRS,
  CAMPUS_MAP_V2_GENDERS,
  CAMPUS_MAP_V2_WHEELCHAIR_ACCESS,
} from "@/lib/campus-map/controlled-values";
import type { CampusMapPlacePhotoRole } from "@/lib/campus-map/place-photos-contract";

/** Runtime values shared by publish clients and versioned snapshot codecs. */
export const CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES = {
  placeType: CAMPUS_MAP_PLACE_TYPES,
  capability: CAMPUS_MAP_CAPABILITIES,
  gender: CAMPUS_MAP_V2_GENDERS,
  wheelchairAccess: CAMPUS_MAP_V2_WHEELCHAIR_ACCESS,
  provenanceKind: CAMPUS_MAP_PROVENANCE_KINDS,
  rightsStatus: CAMPUS_MAP_RIGHTS_STATUSES,
  sourceCoordinateCrs: CAMPUS_MAP_SOURCE_COORDINATE_CRS,
  coordinateConversionMethod: CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
} as const satisfies {
  placeType: readonly CampusMapPlaceType[];
  capability: readonly CampusMapCapability[];
  gender: readonly CampusMapV2Gender[];
  wheelchairAccess: readonly CampusMapV2WheelchairAccess[];
  provenanceKind: readonly CampusMapProvenanceKind[];
  rightsStatus: readonly CampusMapRightsStatus[];
  sourceCoordinateCrs: readonly CampusMapSourceCoordinateCrs[];
  coordinateConversionMethod: readonly CampusMapCoordinateConversionMethod[];
};

export interface CampusMapPublishFactInput {
  name: string;
  buildingId: string | null;
  floorId: string | null;
  placeType: CampusMapPlaceType;
  regularHours: CampusMapRegularHours | null;
  officialActions: CampusMapOfficialAction[];
  visitNote: string | null;
  capabilities: CampusMapCapability[];
  gender: CampusMapV2Gender | null;
  wheelchairAccess: CampusMapV2WheelchairAccess | null;
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

export interface CampusMapPublishPhotoInput {
  assetId: string;
  role: CampusMapPlacePhotoRole;
}

export type CampusMapPublishChange =
  | {
      operation: "create";
      fact: CampusMapPublishFactInput;
      sources: CampusMapPublishSourceInput[];
      photos?: CampusMapPublishPhotoInput[];
    }
  | {
      operation: "update";
      placeId: string;
      baseRevisionId: string;
      fact: CampusMapPublishFactInput;
      sources: CampusMapPublishSourceInput[];
      /** Omit to carry the base revision's photos forward unchanged. */
      photos?: CampusMapPublishPhotoInput[];
    }
  /** Lifecycle governance operation; the publish seam requires a fresh admin role. */
  | {
      operation: "restore";
      placeId: string;
      baseRevisionId: string;
      fact: CampusMapPublishFactInput;
      sources: CampusMapPublishSourceInput[];
    }
  /** Lifecycle governance operation; the publish seam requires a fresh admin role. */
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
        currentPhotos?: CampusMapPublishPhotoInput[];
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
        | "contributor-blocked"
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
