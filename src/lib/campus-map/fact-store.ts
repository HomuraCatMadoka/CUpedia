import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or } from "drizzle-orm";

import { db } from "@/db";
import {
  campusMapBuildings,
  campusMapChangesets,
  campusMapCurrentFacts,
  campusMapFactRevisions,
  campusMapFactSchemas,
  campusMapFloors,
  campusMapPlaceChanges,
  campusMapProvenanceSources,
  campusMapRevisionProvenance,
  campusMapRevisionVisibility,
  CAMPUS_MAP_FACT_DISPLAY_METADATA_V1,
  CAMPUS_MAP_FACT_SCHEMA_V1,
  type CampusMapAccessSchedule,
  type CampusMapAudience,
  type CampusMapCapability,
  type CampusMapCredentialRequirement,
  type CampusMapCoordinateConversionMethod,
  type CampusMapFactDisplayMetadata,
  type CampusMapFactSchemaDefinition,
  type CampusMapFieldDiff,
  type CampusMapGender,
  type CampusMapLocationKind,
  type CampusMapPinType,
  type CampusMapPlaceOperation,
  type CampusMapPointPrecision,
  type CampusMapProvenanceKind,
  type CampusMapReservationRequirement,
  type CampusMapRevisionStatus,
  type CampusMapRightsStatus,
  type CampusMapSourceCoordinateCrs,
  type CampusMapTemporaryStatus,
  type CampusMapWheelchairAccess,
} from "@/db/schema";

export type CampusMapCurrentPlaceLocation =
  | {
      kind: "building";
      building: CampusMapBuildingSummary;
    }
  | {
      kind: "floor";
      building: CampusMapBuildingSummary;
      floor: CampusMapFloorSummary;
    }
  | {
      kind: "outdoor-point";
      point: {
        longitude: number;
        latitude: number;
        crs: "wgs84";
        precision: "approximate" | "precise";
      };
    };

export interface CampusMapBuildingSummary {
  id: string;
  name: string;
  englishName: string | null;
  code: string | null;
}

export interface CampusMapFloorSummary {
  id: string;
  displayLabel: string;
  sortOrder: number;
}

export interface CampusMapCurrentPlace {
  id: string;
  revisionId: string;
  factSchemaVersion: number;
  name: string;
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
  location: CampusMapCurrentPlaceLocation;
  observedAt: Date | null;
  verifiedAt: Date | null;
  publishedAt: Date;
  provenance: CampusMapPublicProvenance[];
}

export interface CampusMapPublicProvenance {
  kind: CampusMapProvenanceKind;
  ref: string;
  url: string | null;
  version: string | null;
  accessedOn: string;
  observedAt: Date | null;
  rightsStatus: CampusMapRightsStatus;
  limitations: string | null;
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

export interface CampusMapCurrentPlaceFilters {
  buildingId?: string;
  floorId?: string;
  pinType?: CampusMapPinType;
  bounds?: { west: number; south: number; east: number; north: number };
  afterPlaceId?: string;
  limit?: number;
}

export interface CampusMapFactSchema {
  version: number;
  definition: CampusMapFactSchemaDefinition;
  displayMetadata: CampusMapFactDisplayMetadata;
}

export interface CampusMapPlaceHistoryCursor {
  createdAt: Date;
  revisionId: string;
}

export interface CampusMapHistoricalFact {
  name: string;
  pinType: CampusMapPinType;
  capabilities: CampusMapCapability[];
  gender: CampusMapGender;
  wheelchairAccess: CampusMapWheelchairAccess;
  audience: CampusMapAudience;
  credentialRequirement: CampusMapCredentialRequirement;
  accessSchedule: CampusMapAccessSchedule;
  reservationRequirement: CampusMapReservationRequirement;
  temporaryStatus: CampusMapTemporaryStatus;
  buildingId: string | null;
  floorId: string | null;
  locationKind: CampusMapLocationKind;
  pointPrecision: CampusMapPointPrecision | null;
  longitude: number | null;
  latitude: number | null;
  coordinateCrs: "wgs84" | null;
  observedAt: Date | null;
  verifiedAt: Date | null;
  verifiedByActorIdSnapshot: string | null;
  provenance: CampusMapPublicProvenance[];
}

export interface CampusMapPlaceHistoryItem {
  id: string;
  placeId: string;
  previousRevisionId: string | null;
  status: CampusMapRevisionStatus;
  mergedIntoPlaceId: string | null;
  factSchemaVersion: number;
  fieldMetadata: CampusMapFactDisplayMetadata;
  operation: CampusMapPlaceOperation;
  fieldDiff: CampusMapFieldDiff | null;
  actor: { id: string; nickname: string };
  changesetId: string;
  publishedAt: Date;
  createdAt: Date;
  content:
    | { visibility: "public"; fact: CampusMapHistoricalFact }
    | { visibility: "redacted" };
}

export interface CampusMapPublicChangeset {
  id: string;
  actor: { id: string; nickname: string };
  comment: string;
  sourceSummary: string;
  reviewRequested: boolean;
  client: { name: string; version: string };
  counts: {
    affected: number;
    created: number;
    updated: number;
    retired: number;
    restored: number;
    merged: number;
  };
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
  warnings: Array<{ code: string; count: number }>;
  revertsChangesetId: string | null;
  publishedAt: Date;
  changes: Array<{
    id: string;
    placeId: string;
    operation: CampusMapPlaceOperation;
    fieldDiff: CampusMapFieldDiff | null;
  }>;
}

export interface CampusMapChangesetFeedCursor {
  publishedAt: Date;
  changesetId: string;
}

interface CampusMapCurrentFactRow {
  placeId: string;
  revisionId: string;
  factSchemaVersion: number;
  name: string;
  pinType: CampusMapPinType;
  capabilities: CampusMapCapability[];
  gender: CampusMapGender;
  wheelchairAccess: CampusMapWheelchairAccess;
  audience: CampusMapAudience;
  credentialRequirement: CampusMapCredentialRequirement;
  accessSchedule: CampusMapAccessSchedule;
  reservationRequirement: CampusMapReservationRequirement;
  temporaryStatus: CampusMapTemporaryStatus;
  locationKind: CampusMapLocationKind;
  pointPrecision: CampusMapPointPrecision | null;
  longitude: number | null;
  latitude: number | null;
  coordinateCrs: "wgs84" | null;
  observedAt: Date | null;
  verifiedAt: Date | null;
  publishedAt: Date;
  buildingId: string | null;
  buildingName: string | null;
  buildingEnglishName: string | null;
  buildingCode: string | null;
  floorId: string | null;
  floorDisplayLabel: string | null;
  floorSortOrder: number | null;
}

interface CampusMapChangesetRow {
  id: string;
  actorIdSnapshot: string;
  actorNicknameSnapshot: string;
  comment: string;
  sourceSummary: string;
  reviewRequested: boolean;
  clientName: string;
  clientVersion: string;
  affectedCount: number;
  createdCount: number;
  updatedCount: number;
  retiredCount: number;
  restoredCount: number;
  mergedCount: number;
  bboxWest: number | null;
  bboxSouth: number | null;
  bboxEast: number | null;
  bboxNorth: number | null;
  warningSummary: Array<{ code: string; count: number }>;
  revertsChangesetId: string | null;
  publishedAt: Date;
}

const currentFactSelection = {
  placeId: campusMapCurrentFacts.placeId,
  revisionId: campusMapCurrentFacts.revisionId,
  factSchemaVersion: campusMapCurrentFacts.factSchemaVersion,
  name: campusMapCurrentFacts.name,
  pinType: campusMapCurrentFacts.pinType,
  capabilities: campusMapCurrentFacts.capabilities,
  gender: campusMapCurrentFacts.gender,
  wheelchairAccess: campusMapCurrentFacts.wheelchairAccess,
  audience: campusMapCurrentFacts.audience,
  credentialRequirement: campusMapCurrentFacts.credentialRequirement,
  accessSchedule: campusMapCurrentFacts.accessSchedule,
  reservationRequirement: campusMapCurrentFacts.reservationRequirement,
  temporaryStatus: campusMapCurrentFacts.temporaryStatus,
  locationKind: campusMapCurrentFacts.locationKind,
  pointPrecision: campusMapCurrentFacts.pointPrecision,
  longitude: campusMapCurrentFacts.longitude,
  latitude: campusMapCurrentFacts.latitude,
  coordinateCrs: campusMapCurrentFacts.coordinateCrs,
  observedAt: campusMapCurrentFacts.observedAt,
  verifiedAt: campusMapCurrentFacts.verifiedAt,
  publishedAt: campusMapCurrentFacts.publishedAt,
  buildingId: campusMapBuildings.id,
  buildingName: campusMapBuildings.name,
  buildingEnglishName: campusMapBuildings.englishName,
  buildingCode: campusMapBuildings.code,
  floorId: campusMapFloors.id,
  floorDisplayLabel: campusMapFloors.displayLabel,
  floorSortOrder: campusMapFloors.sortOrder,
};

const changesetSelection = {
  id: campusMapChangesets.id,
  actorIdSnapshot: campusMapChangesets.actorIdSnapshot,
  actorNicknameSnapshot: campusMapChangesets.actorNicknameSnapshot,
  comment: campusMapChangesets.comment,
  sourceSummary: campusMapChangesets.sourceSummary,
  reviewRequested: campusMapChangesets.reviewRequested,
  clientName: campusMapChangesets.clientName,
  clientVersion: campusMapChangesets.clientVersion,
  affectedCount: campusMapChangesets.affectedCount,
  createdCount: campusMapChangesets.createdCount,
  updatedCount: campusMapChangesets.updatedCount,
  retiredCount: campusMapChangesets.retiredCount,
  restoredCount: campusMapChangesets.restoredCount,
  mergedCount: campusMapChangesets.mergedCount,
  bboxWest: campusMapChangesets.bboxWest,
  bboxSouth: campusMapChangesets.bboxSouth,
  bboxEast: campusMapChangesets.bboxEast,
  bboxNorth: campusMapChangesets.bboxNorth,
  warningSummary: campusMapChangesets.warningSummary,
  revertsChangesetId: campusMapChangesets.revertsChangesetId,
  publishedAt: campusMapChangesets.publishedAt,
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Campus Map fact invariant failed: ${message}`);
}

function buildingSummary(row: {
  buildingId: string | null;
  buildingName: string | null;
  buildingEnglishName: string | null;
  buildingCode: string | null;
}): CampusMapBuildingSummary | null {
  if (row.buildingId === null) return null;
  invariant(row.buildingName !== null, "building reference is unresolved");
  return {
    id: row.buildingId,
    name: row.buildingName,
    englishName: row.buildingEnglishName,
    code: row.buildingCode,
  };
}

function projectLocation(row: {
  locationKind: string;
  buildingId: string | null;
  buildingName: string | null;
  buildingEnglishName: string | null;
  buildingCode: string | null;
  floorId: string | null;
  floorDisplayLabel: string | null;
  floorSortOrder: number | null;
  longitude: number | null;
  latitude: number | null;
  coordinateCrs: string | null;
  pointPrecision: string | null;
}): CampusMapCurrentPlaceLocation {
  const building = buildingSummary(row);
  if (row.locationKind === "building") {
    invariant(building !== null, "building evidence has no Building");
    return { kind: "building", building };
  }
  if (row.locationKind === "floor") {
    invariant(building !== null, "floor evidence has no Building");
    invariant(row.floorId !== null, "floor evidence has no Floor");
    invariant(row.floorDisplayLabel !== null, "Floor reference is unresolved");
    invariant(row.floorSortOrder !== null, "Floor order is unresolved");
    return {
      kind: "floor",
      building,
      floor: {
        id: row.floorId,
        displayLabel: row.floorDisplayLabel,
        sortOrder: row.floorSortOrder,
      },
    };
  }
  invariant(row.locationKind === "outdoor-point", "unknown location kind");
  invariant(row.longitude !== null, "outdoor point has no longitude");
  invariant(row.latitude !== null, "outdoor point has no latitude");
  invariant(row.coordinateCrs === "wgs84", "outdoor point is not WGS84");
  invariant(
    row.pointPrecision === "approximate" || row.pointPrecision === "precise",
    "outdoor point has no evidence precision",
  );
  return {
    kind: "outdoor-point",
    point: {
      longitude: row.longitude,
      latitude: row.latitude,
      crs: row.coordinateCrs,
      precision: row.pointPrecision,
    },
  };
}

async function loadProvenanceByRevision(
  revisionIds: string[],
): Promise<Map<string, CampusMapPublicProvenance[]>> {
  if (revisionIds.length === 0) return new Map();
  const rows = await db
    .select({
      revisionId: campusMapRevisionProvenance.revisionId,
      kind: campusMapProvenanceSources.sourceKind,
      ref: campusMapProvenanceSources.sourceRef,
      url: campusMapProvenanceSources.sourceUrl,
      version: campusMapProvenanceSources.sourceVersion,
      accessedOn: campusMapProvenanceSources.accessedOn,
      observedAt: campusMapProvenanceSources.observedAt,
      rightsStatus: campusMapProvenanceSources.rightsStatus,
      limitations: campusMapProvenanceSources.limitations,
      sourceCoordinateX: campusMapProvenanceSources.sourceCoordinateX,
      sourceCoordinateY: campusMapProvenanceSources.sourceCoordinateY,
      sourceCoordinateCrs: campusMapProvenanceSources.sourceCoordinateCrs,
      conversionMethod: campusMapProvenanceSources.conversionMethod,
      conversionVersion: campusMapProvenanceSources.conversionVersion,
    })
    .from(campusMapRevisionProvenance)
    .innerJoin(
      campusMapProvenanceSources,
      eq(
        campusMapRevisionProvenance.provenanceId,
        campusMapProvenanceSources.id,
      ),
    )
    .where(inArray(campusMapRevisionProvenance.revisionId, revisionIds))
    .orderBy(
      asc(campusMapRevisionProvenance.revisionId),
      asc(campusMapProvenanceSources.id),
    );

  const byRevision = new Map<string, CampusMapPublicProvenance[]>();
  for (const { revisionId, ...source } of rows) {
    const sources = byRevision.get(revisionId) ?? [];
    const hasSourceCoordinate =
      source.sourceCoordinateX !== null &&
      source.sourceCoordinateY !== null &&
      source.sourceCoordinateCrs !== null;
    sources.push({
      kind: source.kind,
      ref: source.ref,
      url: source.url,
      version: source.version,
      accessedOn: source.accessedOn,
      observedAt: source.observedAt,
      rightsStatus: source.rightsStatus,
      limitations: source.limitations,
      sourceCoordinate: hasSourceCoordinate
        ? {
            x: source.sourceCoordinateX!,
            y: source.sourceCoordinateY!,
            crs: source.sourceCoordinateCrs!,
            conversion:
              source.conversionMethod !== null &&
              source.conversionVersion !== null
                ? {
                    method: source.conversionMethod,
                    version: source.conversionVersion,
                  }
                : null,
          }
        : null,
    });
    byRevision.set(revisionId, sources);
  }
  return byRevision;
}

function projectCurrentPlace(
  row: CampusMapCurrentFactRow,
  provenance: CampusMapPublicProvenance[],
): CampusMapCurrentPlace {
  return {
    id: row.placeId,
    revisionId: row.revisionId,
    factSchemaVersion: row.factSchemaVersion,
    name: row.name,
    pinType: row.pinType,
    capabilities: row.capabilities,
    access: {
      audience: row.audience,
      credentialRequirement: row.credentialRequirement,
      schedule: row.accessSchedule,
      reservationRequirement: row.reservationRequirement,
      temporaryStatus: row.temporaryStatus,
    },
    facets: {
      gender: row.gender,
      wheelchairAccess: row.wheelchairAccess,
    },
    location: projectLocation(row),
    observedAt: row.observedAt,
    verifiedAt: row.verifiedAt,
    publishedAt: row.publishedAt,
    provenance,
  };
}

/** One schema drives server validation, editor projection, diff, and display. */
export async function getCampusMapFactSchema(
  version?: number,
): Promise<CampusMapFactSchema | null> {
  const [row] = await db
    .select({
      version: campusMapFactSchemas.version,
      definition: campusMapFactSchemas.definition,
      displayMetadata: campusMapFactSchemas.displayMetadata,
    })
    .from(campusMapFactSchemas)
    .where(
      version === undefined
        ? eq(campusMapFactSchemas.status, "active")
        : eq(campusMapFactSchemas.version, version),
    )
    .limit(1);
  if (row) return row;
  if (version === undefined || version === 1) {
    const [storedSchema] = await db
      .select({ version: campusMapFactSchemas.version })
      .from(campusMapFactSchemas)
      .limit(1);
    if (storedSchema && version === undefined) {
      return null;
    }
    return {
      version: 1,
      definition: CAMPUS_MAP_FACT_SCHEMA_V1,
      displayMetadata: CAMPUS_MAP_FACT_DISPLAY_METADATA_V1,
    };
  }
  return null;
}

/**
 * Returns the public active projection for a canonical Place. Retired, merged,
 * unknown, or redacted history is intentionally not reconstructed here.
 */
export async function getCampusMapCurrentPlace(
  placeId: string,
): Promise<CampusMapCurrentPlace | null> {
  const [row] = await db
    .select(currentFactSelection)
    .from(campusMapCurrentFacts)
    .innerJoin(
      campusMapRevisionVisibility,
      eq(
        campusMapCurrentFacts.revisionId,
        campusMapRevisionVisibility.revisionId,
      ),
    )
    .leftJoin(
      campusMapBuildings,
      eq(campusMapCurrentFacts.buildingId, campusMapBuildings.id),
    )
    .leftJoin(
      campusMapFloors,
      and(
        eq(campusMapCurrentFacts.buildingId, campusMapFloors.buildingId),
        eq(campusMapCurrentFacts.floorId, campusMapFloors.id),
      ),
    )
    .where(
      and(
        eq(campusMapCurrentFacts.placeId, placeId),
        eq(campusMapCurrentFacts.status, "active"),
        eq(campusMapRevisionVisibility.visibility, "public"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const provenance = await loadProvenanceByRevision([row.revisionId]);
  return projectCurrentPlace(row, provenance.get(row.revisionId) ?? []);
}

/** Lists active facts through canonical dimensions; no provider identity leaks. */
export async function listCampusMapCurrentPlaces(
  filters: CampusMapCurrentPlaceFilters = {},
): Promise<{ items: CampusMapCurrentPlace[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const conditions = [
    eq(campusMapCurrentFacts.status, "active"),
    eq(campusMapRevisionVisibility.visibility, "public"),
  ];

  if (filters.buildingId) {
    conditions.push(eq(campusMapCurrentFacts.buildingId, filters.buildingId));
  }
  if (filters.floorId) {
    conditions.push(eq(campusMapCurrentFacts.floorId, filters.floorId));
  }
  if (filters.pinType) {
    conditions.push(eq(campusMapCurrentFacts.pinType, filters.pinType));
  }
  if (filters.afterPlaceId) {
    conditions.push(gt(campusMapCurrentFacts.placeId, filters.afterPlaceId));
  }
  let page: CampusMapCurrentFactRow[];
  let hasMore: boolean;
  if (filters.bounds) {
    const { west, south, east, north } = filters.bounds;
    invariant(west <= east && south <= north, "invalid map bounds");

    // Keep the two spatial access paths separate. An OR across facts and a
    // joined Building forces PostgreSQL to scan every Current fact.
    const [pointRows, anchoredRows] = await Promise.all([
      db
        .select({ placeId: campusMapCurrentFacts.placeId })
        .from(campusMapCurrentFacts)
        .innerJoin(
          campusMapRevisionVisibility,
          eq(
            campusMapCurrentFacts.revisionId,
            campusMapRevisionVisibility.revisionId,
          ),
        )
        .where(
          and(
            ...conditions,
            eq(campusMapCurrentFacts.locationKind, "outdoor-point"),
            gte(campusMapCurrentFacts.longitude, west),
            lte(campusMapCurrentFacts.longitude, east),
            gte(campusMapCurrentFacts.latitude, south),
            lte(campusMapCurrentFacts.latitude, north),
          ),
        )
        .orderBy(asc(campusMapCurrentFacts.placeId))
        .limit(limit + 1),
      db
        .select({ placeId: campusMapCurrentFacts.placeId })
        .from(campusMapBuildings)
        .innerJoin(
          campusMapCurrentFacts,
          eq(campusMapBuildings.id, campusMapCurrentFacts.buildingId),
        )
        .innerJoin(
          campusMapRevisionVisibility,
          eq(
            campusMapCurrentFacts.revisionId,
            campusMapRevisionVisibility.revisionId,
          ),
        )
        .where(
          and(
            ...conditions,
            inArray(campusMapCurrentFacts.locationKind, ["building", "floor"]),
            eq(campusMapBuildings.anchorCrs, "wgs84"),
            gte(campusMapBuildings.anchorLongitude, west),
            lte(campusMapBuildings.anchorLongitude, east),
            gte(campusMapBuildings.anchorLatitude, south),
            lte(campusMapBuildings.anchorLatitude, north),
          ),
        )
        .orderBy(asc(campusMapCurrentFacts.placeId))
        .limit(limit + 1),
    ]);
    const placeIds = [
      ...new Set([...pointRows, ...anchoredRows].map((row) => row.placeId)),
    ].sort();
    hasMore = placeIds.length > limit;
    const pageIds = placeIds.slice(0, limit);
    if (pageIds.length === 0) return { items: [], nextCursor: null };
    page = await db
      .select(currentFactSelection)
      .from(campusMapCurrentFacts)
      .innerJoin(
        campusMapRevisionVisibility,
        eq(
          campusMapCurrentFacts.revisionId,
          campusMapRevisionVisibility.revisionId,
        ),
      )
      .leftJoin(
        campusMapBuildings,
        eq(campusMapCurrentFacts.buildingId, campusMapBuildings.id),
      )
      .leftJoin(
        campusMapFloors,
        and(
          eq(campusMapCurrentFacts.buildingId, campusMapFloors.buildingId),
          eq(campusMapCurrentFacts.floorId, campusMapFloors.id),
        ),
      )
      .where(
        and(
          inArray(campusMapCurrentFacts.placeId, pageIds),
          eq(campusMapCurrentFacts.status, "active"),
          eq(campusMapRevisionVisibility.visibility, "public"),
        ),
      )
      .orderBy(asc(campusMapCurrentFacts.placeId));
  } else {
    const rows = await db
      .select(currentFactSelection)
      .from(campusMapCurrentFacts)
      .innerJoin(
        campusMapRevisionVisibility,
        eq(
          campusMapCurrentFacts.revisionId,
          campusMapRevisionVisibility.revisionId,
        ),
      )
      .leftJoin(
        campusMapBuildings,
        eq(campusMapCurrentFacts.buildingId, campusMapBuildings.id),
      )
      .leftJoin(
        campusMapFloors,
        and(
          eq(campusMapCurrentFacts.buildingId, campusMapFloors.buildingId),
          eq(campusMapCurrentFacts.floorId, campusMapFloors.id),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(campusMapCurrentFacts.placeId))
      .limit(limit + 1);
    hasMore = rows.length > limit;
    page = rows.slice(0, limit);
  }

  const provenance = await loadProvenanceByRevision(
    page.map((row) => row.revisionId),
  );
  const items = page.map((row) =>
    projectCurrentPlace(row, provenance.get(row.revisionId) ?? []),
  );

  return {
    items,
    nextCursor: hasMore ? page.at(-1)!.placeId : null,
  };
}

/** Reads immutable history and hides fact payloads unless explicitly public. */
export async function getCampusMapPlaceHistory(
  placeId: string,
  options: { before?: CampusMapPlaceHistoryCursor; limit?: number } = {},
): Promise<{
  items: CampusMapPlaceHistoryItem[];
  nextCursor: CampusMapPlaceHistoryCursor | null;
}> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions = [eq(campusMapFactRevisions.placeId, placeId)];
  if (options.before) {
    conditions.push(
      or(
        lt(campusMapFactRevisions.createdAt, options.before.createdAt),
        and(
          eq(campusMapFactRevisions.createdAt, options.before.createdAt),
          lt(campusMapFactRevisions.id, options.before.revisionId),
        ),
      )!,
    );
  }

  const rows = await db
    .select({
      id: campusMapFactRevisions.id,
      placeId: campusMapFactRevisions.placeId,
      previousRevisionId: campusMapFactRevisions.previousRevisionId,
      status: campusMapFactRevisions.status,
      mergedIntoPlaceId: campusMapFactRevisions.mergedIntoPlaceId,
      factSchemaVersion: campusMapFactRevisions.factSchemaVersion,
      fieldMetadata: campusMapFactRevisions.fieldMetadata,
      name: campusMapFactRevisions.name,
      pinType: campusMapFactRevisions.pinType,
      capabilities: campusMapFactRevisions.capabilities,
      gender: campusMapFactRevisions.gender,
      wheelchairAccess: campusMapFactRevisions.wheelchairAccess,
      audience: campusMapFactRevisions.audience,
      credentialRequirement: campusMapFactRevisions.credentialRequirement,
      accessSchedule: campusMapFactRevisions.accessSchedule,
      reservationRequirement: campusMapFactRevisions.reservationRequirement,
      temporaryStatus: campusMapFactRevisions.temporaryStatus,
      buildingId: campusMapFactRevisions.buildingId,
      floorId: campusMapFactRevisions.floorId,
      locationKind: campusMapFactRevisions.locationKind,
      pointPrecision: campusMapFactRevisions.pointPrecision,
      longitude: campusMapFactRevisions.longitude,
      latitude: campusMapFactRevisions.latitude,
      coordinateCrs: campusMapFactRevisions.coordinateCrs,
      observedAt: campusMapFactRevisions.observedAt,
      verifiedAt: campusMapFactRevisions.verifiedAt,
      verifiedByActorIdSnapshot:
        campusMapFactRevisions.verifiedByActorIdSnapshot,
      createdAt: campusMapFactRevisions.createdAt,
      changesetId: campusMapChangesets.id,
      actorId: campusMapChangesets.actorIdSnapshot,
      actorNickname: campusMapChangesets.actorNicknameSnapshot,
      publishedAt: campusMapChangesets.publishedAt,
      operation: campusMapPlaceChanges.operation,
      fieldDiff: campusMapPlaceChanges.fieldDiff,
      visibility: campusMapRevisionVisibility.visibility,
    })
    .from(campusMapFactRevisions)
    .innerJoin(
      campusMapPlaceChanges,
      eq(campusMapFactRevisions.placeChangeId, campusMapPlaceChanges.id),
    )
    .innerJoin(
      campusMapChangesets,
      eq(campusMapFactRevisions.changesetId, campusMapChangesets.id),
    )
    .leftJoin(
      campusMapRevisionVisibility,
      eq(campusMapFactRevisions.id, campusMapRevisionVisibility.revisionId),
    )
    .where(and(...conditions))
    .orderBy(
      desc(campusMapFactRevisions.createdAt),
      desc(campusMapFactRevisions.id),
    )
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const provenance = await loadProvenanceByRevision(
    page.filter((row) => row.visibility === "public").map((row) => row.id),
  );
  const items = page.map(
    (row): CampusMapPlaceHistoryItem => ({
      id: row.id,
      placeId: row.placeId,
      previousRevisionId: row.previousRevisionId,
      status: row.status,
      mergedIntoPlaceId: row.mergedIntoPlaceId,
      factSchemaVersion: row.factSchemaVersion,
      fieldMetadata: row.fieldMetadata,
      operation: row.operation,
      fieldDiff: row.visibility === "public" ? row.fieldDiff : null,
      actor: { id: row.actorId, nickname: row.actorNickname },
      changesetId: row.changesetId,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      content:
        row.visibility === "public"
          ? {
              visibility: "public",
              fact: {
                name: row.name,
                pinType: row.pinType,
                capabilities: row.capabilities,
                gender: row.gender,
                wheelchairAccess: row.wheelchairAccess,
                audience: row.audience,
                credentialRequirement: row.credentialRequirement,
                accessSchedule: row.accessSchedule,
                reservationRequirement: row.reservationRequirement,
                temporaryStatus: row.temporaryStatus,
                buildingId: row.buildingId,
                floorId: row.floorId,
                locationKind: row.locationKind,
                pointPrecision: row.pointPrecision,
                longitude: row.longitude,
                latitude: row.latitude,
                coordinateCrs: row.coordinateCrs,
                observedAt: row.observedAt,
                verifiedAt: row.verifiedAt,
                verifiedByActorIdSnapshot: row.verifiedByActorIdSnapshot,
                provenance: provenance.get(row.id) ?? [],
              },
            }
          : { visibility: "redacted" },
    }),
  );

  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? { createdAt: last.createdAt, revisionId: last.id }
        : null,
  };
}

async function loadChangesByChangeset(
  changesetIds: string[],
): Promise<Map<string, CampusMapPublicChangeset["changes"]>> {
  if (changesetIds.length === 0) return new Map();
  const rows = await db
    .select({
      changesetId: campusMapPlaceChanges.changesetId,
      id: campusMapPlaceChanges.id,
      placeId: campusMapPlaceChanges.placeId,
      operation: campusMapPlaceChanges.operation,
      fieldDiff: campusMapPlaceChanges.fieldDiff,
      visibility: campusMapRevisionVisibility.visibility,
    })
    .from(campusMapPlaceChanges)
    .innerJoin(
      campusMapFactRevisions,
      eq(campusMapPlaceChanges.id, campusMapFactRevisions.placeChangeId),
    )
    .leftJoin(
      campusMapRevisionVisibility,
      eq(campusMapFactRevisions.id, campusMapRevisionVisibility.revisionId),
    )
    .where(inArray(campusMapPlaceChanges.changesetId, changesetIds))
    .orderBy(
      asc(campusMapPlaceChanges.changesetId),
      asc(campusMapPlaceChanges.id),
    );

  const byChangeset = new Map<string, CampusMapPublicChangeset["changes"]>();
  for (const { changesetId, visibility, ...change } of rows) {
    const changes = byChangeset.get(changesetId) ?? [];
    changes.push({
      ...change,
      fieldDiff: visibility === "public" ? change.fieldDiff : null,
    });
    byChangeset.set(changesetId, changes);
  }
  return byChangeset;
}

function projectChangeset(
  row: CampusMapChangesetRow,
  changes: CampusMapPublicChangeset["changes"],
): CampusMapPublicChangeset {
  const hasBbox =
    row.bboxWest !== null &&
    row.bboxSouth !== null &&
    row.bboxEast !== null &&
    row.bboxNorth !== null;
  return {
    id: row.id,
    actor: { id: row.actorIdSnapshot, nickname: row.actorNicknameSnapshot },
    comment: row.comment,
    sourceSummary: row.sourceSummary,
    reviewRequested: row.reviewRequested,
    client: { name: row.clientName, version: row.clientVersion },
    counts: {
      affected: row.affectedCount,
      created: row.createdCount,
      updated: row.updatedCount,
      retired: row.retiredCount,
      restored: row.restoredCount,
      merged: row.mergedCount,
    },
    bbox: hasBbox
      ? {
          west: row.bboxWest!,
          south: row.bboxSouth!,
          east: row.bboxEast!,
          north: row.bboxNorth!,
        }
      : null,
    warnings: row.warningSummary,
    revertsChangesetId: row.revertsChangesetId,
    publishedAt: row.publishedAt,
    changes,
  };
}

/** Returns public Changeset/feed data; private publish-request rows are separate. */
export async function getCampusMapChangeset(
  changesetId: string,
): Promise<CampusMapPublicChangeset | null> {
  const [row] = await db
    .select(changesetSelection)
    .from(campusMapChangesets)
    .where(eq(campusMapChangesets.id, changesetId))
    .limit(1);
  if (!row) return null;

  const changes = await loadChangesByChangeset([changesetId]);
  return projectChangeset(row, changes.get(changesetId) ?? []);
}

export async function listCampusMapChangesets(
  options: {
    before?: CampusMapChangesetFeedCursor;
    reviewRequested?: boolean;
    limit?: number;
  } = {},
): Promise<{
  items: CampusMapPublicChangeset[];
  nextCursor: CampusMapChangesetFeedCursor | null;
}> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions = [];
  if (options.reviewRequested !== undefined) {
    conditions.push(
      eq(campusMapChangesets.reviewRequested, options.reviewRequested),
    );
  }
  if (options.before) {
    conditions.push(
      or(
        lt(campusMapChangesets.publishedAt, options.before.publishedAt),
        and(
          eq(campusMapChangesets.publishedAt, options.before.publishedAt),
          lt(campusMapChangesets.id, options.before.changesetId),
        ),
      )!,
    );
  }

  const rows = await db
    .select(changesetSelection)
    .from(campusMapChangesets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      desc(campusMapChangesets.publishedAt),
      desc(campusMapChangesets.id),
    )
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const changes = await loadChangesByChangeset(page.map((row) => row.id));
  const items = page.map((row) =>
    projectChangeset(row, changes.get(row.id) ?? []),
  );
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? { publishedAt: last.publishedAt, changesetId: last.id }
        : null,
  };
}
