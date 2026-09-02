import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  campusMapBuildings,
  campusMapChangesets,
  campusMapCurrentFacts,
  campusMapCurrentRevisions,
  campusMapFactRevisions,
  campusMapFactSchemas,
  campusMapFloors,
  campusMapPlaceChanges,
  campusMapPlaces,
  campusMapProvenanceSources,
  campusMapRevisionProvenance,
  campusMapRevisionVisibility,
  CAMPUS_MAP_FACT_DISPLAY_METADATA_V1,
  CAMPUS_MAP_FACT_SCHEMA_V1,
  type CampusMapAccessSchedule,
  type CampusMapAudience,
  type CampusMapCapability,
  type CampusMapCredentialRequirement,
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
  type CampusMapTemporaryStatus,
  type CampusMapWheelchairAccess,
} from "@/db/schema";
import { isCampusMapUuid } from "@/lib/campus-map/canonical-uuid";

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

export interface CampusMapBrowseBuildingRecord {
  buildingId: string;
  name: string;
  englishName: string | null;
  code: string | null;
  aliases: readonly string[];
  anchor: {
    longitude: number;
    latitude: number;
    crs: "wgs84";
  } | null;
  floors: ReadonlyArray<{
    floorId: string;
    displayLabel: string;
    sortOrder: number;
  }>;
}

export type CampusMapSelectionTarget =
  | { kind: "building"; buildingId: string }
  | {
      kind: "place";
      placeId: string;
      buildingId: string | null;
      floorId: string | null;
    };

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
  accessedOn: string;
  observedAt: Date | null;
  rightsStatus: CampusMapRightsStatus;
  hasLocationEvidence: boolean;
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
  comment: string;
  sourceSummary: string;
  publishedAt: Date;
  createdAt: Date;
  content:
    | { visibility: "public"; fact: CampusMapHistoricalFact }
    | { visibility: "redacted" };
}

export interface CampusMapPlaceHistoryHead {
  revisionId: string;
  status: CampusMapRevisionStatus;
  visibility: "public" | "redacted";
  mergedIntoPlaceId: string | null;
  name: string | null;
}

export interface CampusMapPublicChangeset {
  id: string;
  actor: { id: string; nickname: string };
  comment: string;
  sourceSummary: string;
  reviewRequested: boolean;
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
  revertsChangesetId: string | null;
  publishedAt: Date;
  changes: CampusMapPublicChange[];
}

type CampusMapTypedDiffValue = CampusMapFieldDiff[string];

export type CampusMapPublicChange =
  | {
      visibility: "public";
      placeId: string;
      revisionId: string;
      previousRevisionId: string | null;
      status: CampusMapRevisionStatus;
      mergedIntoPlaceId: string | null;
      operation: CampusMapPlaceOperation;
      schema: CampusMapFactSchema;
      diff: {
        fields: CampusMapFieldDiff;
        position: CampusMapTypedDiffValue | null;
        provenance: {
          before: CampusMapPublicProvenance[];
          after: CampusMapPublicProvenance[];
        };
      };
    }
  | {
      visibility: "redacted";
      placeId: string;
      revisionId: string;
    };

export interface CampusMapChangesetFeedCursor {
  publishedAt: Date;
  changesetId: string;
}

export interface CampusMapChangesetSummary {
  id: string;
  actor: { id: string; nickname: string };
  comment: string;
  sourceSummary: string;
  reviewRequested: boolean;
  counts: CampusMapPublicChangeset["counts"];
  bbox: CampusMapPublicChangeset["bbox"];
  revertsChangesetId: string | null;
  publishedAt: Date;
}

export type CampusMapChangesetFeedScope =
  | { kind: "recent" }
  | { kind: "actor"; actorId: string }
  | {
      kind: "bbox";
      bounds: { west: number; south: number; east: number; north: number };
    }
  | { kind: "reviewRequested" };

export class CampusMapReadInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampusMapReadInputError";
  }
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
  revertsChangesetId: string | null;
  publishedAt: Date;
  hasOnlyPublicChanges: boolean;
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

const hasOnlyPublicChanges = sql<boolean>`not exists (
  select 1
  from campus_map_place_changes public_change
  left join campus_map_fact_revisions public_revision
    on public_revision.place_change_id = public_change.id
  left join campus_map_revision_visibility public_visibility
    on public_visibility.revision_id = public_revision.id
  where public_change.changeset_id =
    ${sql.identifier("campus_map_changesets")}.${sql.identifier("id")}
    and (
      public_revision.id is null
      or coalesce(public_visibility.visibility, 'redacted') <> 'public'
      or (
        public_revision.previous_revision_id is not null
        and not exists (
          select 1
          from campus_map_revision_visibility predecessor_visibility
          where predecessor_visibility.revision_id =
            public_revision.previous_revision_id
            and predecessor_visibility.visibility = 'public'
        )
      )
    )
) and (
  select count(*)::integer
  from campus_map_place_changes counted_change
  where counted_change.changeset_id =
    ${sql.identifier("campus_map_changesets")}.${sql.identifier("id")}
) = ${sql.identifier("campus_map_changesets")}.${sql.identifier("affected_count")}`;

const changesetSelection = {
  id: campusMapChangesets.id,
  actorIdSnapshot: campusMapChangesets.actorIdSnapshot,
  actorNicknameSnapshot: campusMapChangesets.actorNicknameSnapshot,
  comment: campusMapChangesets.comment,
  sourceSummary: campusMapChangesets.sourceSummary,
  reviewRequested: campusMapChangesets.reviewRequested,
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
  revertsChangesetId: campusMapChangesets.revertsChangesetId,
  publishedAt: campusMapChangesets.publishedAt,
  hasOnlyPublicChanges,
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Campus Map fact invariant failed: ${message}`);
}

function isPublicId(value: string) {
  return isCampusMapUuid(value);
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
      accessedOn: campusMapProvenanceSources.accessedOn,
      observedAt: campusMapProvenanceSources.observedAt,
      rightsStatus: campusMapProvenanceSources.rightsStatus,
      sourceCoordinateX: campusMapProvenanceSources.sourceCoordinateX,
      sourceCoordinateY: campusMapProvenanceSources.sourceCoordinateY,
    })
    .from(campusMapRevisionProvenance)
    .innerJoin(
      campusMapProvenanceSources,
      eq(
        campusMapRevisionProvenance.provenanceId,
        campusMapProvenanceSources.id,
      ),
    )
    .innerJoin(
      campusMapRevisionVisibility,
      eq(
        campusMapRevisionProvenance.revisionId,
        campusMapRevisionVisibility.revisionId,
      ),
    )
    .where(
      and(
        inArray(campusMapRevisionProvenance.revisionId, revisionIds),
        eq(campusMapRevisionVisibility.visibility, "public"),
      ),
    )
    .orderBy(
      asc(campusMapRevisionProvenance.revisionId),
      asc(campusMapProvenanceSources.id),
    );

  const byRevision = new Map<string, CampusMapPublicProvenance[]>();
  for (const { revisionId, ...source } of rows) {
    const sources = byRevision.get(revisionId) ?? [];
    sources.push({
      kind: source.kind,
      accessedOn: source.accessedOn,
      observedAt: source.observedAt,
      rightsStatus: source.rightsStatus,
      hasLocationEvidence:
        source.sourceCoordinateX !== null && source.sourceCoordinateY !== null,
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
  if (!isPublicId(placeId)) return null;
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

/** Lists formal Building/Floor references without exposing provider identity. */
export async function listCampusMapBrowseBuildings(): Promise<
  CampusMapBrowseBuildingRecord[]
> {
  const rows = await db
    .select({
      buildingId: campusMapBuildings.id,
      name: campusMapBuildings.name,
      englishName: campusMapBuildings.englishName,
      code: campusMapBuildings.code,
      aliases: campusMapBuildings.aliases,
      anchorLongitude: campusMapBuildings.anchorLongitude,
      anchorLatitude: campusMapBuildings.anchorLatitude,
      anchorCrs: campusMapBuildings.anchorCrs,
      floorId: campusMapFloors.id,
      floorDisplayLabel: campusMapFloors.displayLabel,
      floorSortOrder: campusMapFloors.sortOrder,
    })
    .from(campusMapBuildings)
    .leftJoin(
      campusMapFloors,
      eq(campusMapBuildings.id, campusMapFloors.buildingId),
    )
    .orderBy(
      asc(campusMapBuildings.name),
      asc(campusMapBuildings.id),
      asc(campusMapFloors.sortOrder),
      asc(campusMapFloors.id),
    );

  const buildings = new Map<string, CampusMapBrowseBuildingRecord>();
  for (const row of rows) {
    let building = buildings.get(row.buildingId);
    if (!building) {
      const hasAnchor =
        row.anchorLongitude !== null &&
        row.anchorLatitude !== null &&
        row.anchorCrs === "wgs84";
      building = {
        buildingId: row.buildingId,
        name: row.name,
        englishName: row.englishName,
        code: row.code,
        aliases: row.aliases,
        anchor: hasAnchor
          ? {
              longitude: row.anchorLongitude!,
              latitude: row.anchorLatitude!,
              crs: "wgs84",
            }
          : null,
        floors: [],
      };
      buildings.set(row.buildingId, building);
    }
    if (
      row.floorId !== null &&
      row.floorDisplayLabel !== null &&
      row.floorSortOrder !== null
    ) {
      (building.floors as Array<(typeof building.floors)[number]>).push({
        floorId: row.floorId,
        displayLabel: row.floorDisplayLabel,
        sortOrder: row.floorSortOrder,
      });
    }
  }
  return [...buildings.values()];
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
  options: { cursor?: string; limit?: number } = {},
): Promise<{
  placeExists: boolean;
  head: CampusMapPlaceHistoryHead | null;
  items: CampusMapPlaceHistoryItem[];
  nextCursor: string | null;
}> {
  if (!isPublicId(placeId)) {
    return { placeExists: false, head: null, items: [], nextCursor: null };
  }
  const placePromise = db
    .select({ id: campusMapPlaces.id })
    .from(campusMapPlaces)
    .where(eq(campusMapPlaces.id, placeId))
    .limit(1);
  const headPromise = db
    .select({
      revisionId: campusMapFactRevisions.id,
      status: campusMapFactRevisions.status,
      mergedIntoPlaceId: campusMapFactRevisions.mergedIntoPlaceId,
      name: campusMapFactRevisions.name,
      visibility: campusMapRevisionVisibility.visibility,
    })
    .from(campusMapCurrentRevisions)
    .innerJoin(
      campusMapFactRevisions,
      and(
        eq(campusMapCurrentRevisions.placeId, campusMapFactRevisions.placeId),
        eq(campusMapCurrentRevisions.revisionId, campusMapFactRevisions.id),
      ),
    )
    .leftJoin(
      campusMapRevisionVisibility,
      eq(campusMapFactRevisions.id, campusMapRevisionVisibility.revisionId),
    )
    .where(eq(campusMapCurrentRevisions.placeId, placeId))
    .limit(1);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions = [eq(campusMapFactRevisions.placeId, placeId)];
  const before = options.cursor
    ? decodePlaceHistoryCursor(options.cursor)
    : null;
  if (before) {
    conditions.push(
      or(
        lt(campusMapFactRevisions.createdAt, before.createdAt),
        and(
          eq(campusMapFactRevisions.createdAt, before.createdAt),
          lt(campusMapFactRevisions.id, before.revisionId),
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
      createdAt: campusMapFactRevisions.createdAt,
      changesetId: campusMapChangesets.id,
      comment: campusMapChangesets.comment,
      sourceSummary: campusMapChangesets.sourceSummary,
      actorId: campusMapChangesets.actorIdSnapshot,
      actorNickname: campusMapChangesets.actorNicknameSnapshot,
      publishedAt: campusMapChangesets.publishedAt,
      operation: campusMapPlaceChanges.operation,
      fieldDiff: campusMapPlaceChanges.fieldDiff,
      visibility: campusMapRevisionVisibility.visibility,
      previousVisibility: sql<"public" | "redacted" | null>`(
        select predecessor_visibility.visibility
        from campus_map_revision_visibility predecessor_visibility
        where predecessor_visibility.revision_id =
          ${campusMapFactRevisions.previousRevisionId}
      )`,
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
      fieldDiff:
        row.visibility === "public" &&
        (row.previousRevisionId === null || row.previousVisibility === "public")
          ? row.fieldDiff
          : null,
      actor: { id: row.actorId, nickname: row.actorNickname },
      changesetId: row.changesetId,
      comment: row.comment,
      sourceSummary: row.sourceSummary,
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
                provenance: provenance.get(row.id) ?? [],
              },
            }
          : { visibility: "redacted" },
    }),
  );

  const last = page.at(-1);
  const [place, headRows] = await Promise.all([placePromise, headPromise]);
  const headRow = headRows[0];
  return {
    placeExists: place.length === 1,
    head: headRow
      ? {
          revisionId: headRow.revisionId,
          status: headRow.status,
          visibility: headRow.visibility === "public" ? "public" : "redacted",
          mergedIntoPlaceId: headRow.mergedIntoPlaceId,
          name: headRow.visibility === "public" ? headRow.name : null,
        }
      : null,
    items,
    nextCursor:
      rows.length > limit && last
        ? encodePlaceHistoryCursor({
            createdAt: last.createdAt,
            revisionId: last.id,
          })
        : null,
  };
}

function encodePlaceHistoryCursor(cursor: CampusMapPlaceHistoryCursor): string {
  return Buffer.from(
    JSON.stringify([1, cursor.createdAt.toISOString(), cursor.revisionId]),
  ).toString("base64url");
}

function decodePlaceHistoryCursor(value: string): CampusMapPlaceHistoryCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 3 ||
      decoded[0] !== 1 ||
      typeof decoded[1] !== "string" ||
      typeof decoded[2] !== "string" ||
      !isCampusMapUuid(decoded[2])
    ) {
      throw new Error("invalid shape");
    }
    const createdAt = new Date(decoded[1]);
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid date");
    return { createdAt, revisionId: decoded[2] };
  } catch {
    throw new CampusMapReadInputError("Invalid Campus Map history cursor");
  }
}

/** Reads one immutable revision by both permanent Place and revision IDs. */
export async function getCampusMapPlaceRevision(
  placeId: string,
  revisionId: string,
): Promise<
  (CampusMapPlaceHistoryItem & { schema: CampusMapFactSchema }) | null
> {
  if (!isPublicId(placeId) || !isPublicId(revisionId)) return null;
  const [row] = await db
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
      createdAt: campusMapFactRevisions.createdAt,
      changesetId: campusMapChangesets.id,
      comment: campusMapChangesets.comment,
      sourceSummary: campusMapChangesets.sourceSummary,
      actorId: campusMapChangesets.actorIdSnapshot,
      actorNickname: campusMapChangesets.actorNicknameSnapshot,
      publishedAt: campusMapChangesets.publishedAt,
      operation: campusMapPlaceChanges.operation,
      fieldDiff: campusMapPlaceChanges.fieldDiff,
      visibility: campusMapRevisionVisibility.visibility,
      schemaDefinition: campusMapFactSchemas.definition,
      previousVisibility: sql<"public" | "redacted" | null>`(
        select predecessor_visibility.visibility
        from campus_map_revision_visibility predecessor_visibility
        where predecessor_visibility.revision_id =
          ${campusMapFactRevisions.previousRevisionId}
      )`,
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
    .innerJoin(
      campusMapFactSchemas,
      eq(
        campusMapFactRevisions.factSchemaVersion,
        campusMapFactSchemas.version,
      ),
    )
    .leftJoin(
      campusMapRevisionVisibility,
      eq(campusMapFactRevisions.id, campusMapRevisionVisibility.revisionId),
    )
    .where(
      and(
        eq(campusMapFactRevisions.placeId, placeId),
        eq(campusMapFactRevisions.id, revisionId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const provenance =
    row.visibility === "public"
      ? await loadProvenanceByRevision([row.id])
      : new Map<string, CampusMapPublicProvenance[]>();
  return {
    id: row.id,
    placeId: row.placeId,
    previousRevisionId: row.previousRevisionId,
    status: row.status,
    mergedIntoPlaceId: row.mergedIntoPlaceId,
    factSchemaVersion: row.factSchemaVersion,
    fieldMetadata: row.fieldMetadata,
    schema: {
      version: row.factSchemaVersion,
      definition: row.schemaDefinition,
      displayMetadata: row.fieldMetadata,
    },
    operation: row.operation,
    fieldDiff:
      row.visibility === "public" &&
      (row.previousRevisionId === null || row.previousVisibility === "public")
        ? row.fieldDiff
        : null,
    actor: { id: row.actorId, nickname: row.actorNickname },
    changesetId: row.changesetId,
    comment: row.comment,
    sourceSummary: row.sourceSummary,
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
              provenance: provenance.get(row.id) ?? [],
            },
          }
        : { visibility: "redacted" },
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
      revisionId: campusMapFactRevisions.id,
      previousRevisionId: campusMapFactRevisions.previousRevisionId,
      status: campusMapFactRevisions.status,
      mergedIntoPlaceId: campusMapFactRevisions.mergedIntoPlaceId,
      factSchemaVersion: campusMapFactRevisions.factSchemaVersion,
      fieldMetadata: campusMapFactRevisions.fieldMetadata,
      schemaDefinition: campusMapFactSchemas.definition,
      visibility: campusMapRevisionVisibility.visibility,
      previousVisibility: sql<"public" | "redacted" | null>`(
        select predecessor_visibility.visibility
        from campus_map_revision_visibility predecessor_visibility
        where predecessor_visibility.revision_id =
          ${campusMapFactRevisions.previousRevisionId}
      )`,
    })
    .from(campusMapPlaceChanges)
    .innerJoin(
      campusMapFactRevisions,
      eq(campusMapPlaceChanges.id, campusMapFactRevisions.placeChangeId),
    )
    .innerJoin(
      campusMapFactSchemas,
      eq(
        campusMapFactRevisions.factSchemaVersion,
        campusMapFactSchemas.version,
      ),
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

  const provenance = await loadProvenanceByRevision(
    rows.flatMap((row) =>
      row.visibility === "public"
        ? [row.revisionId, row.previousRevisionId].filter(
            (id): id is string => id !== null,
          )
        : [],
    ),
  );

  const byChangeset = new Map<string, CampusMapPublicChangeset["changes"]>();
  for (const row of rows) {
    const changes = byChangeset.get(row.changesetId) ?? [];
    const hasPublicPredecessor =
      row.previousRevisionId === null || row.previousVisibility === "public";
    changes.push(
      row.visibility === "public" && hasPublicPredecessor
        ? {
            visibility: "public",
            placeId: row.placeId,
            revisionId: row.revisionId,
            previousRevisionId: row.previousRevisionId,
            status: row.status,
            mergedIntoPlaceId: row.mergedIntoPlaceId,
            operation: row.operation,
            schema: {
              version: row.factSchemaVersion,
              definition: row.schemaDefinition,
              displayMetadata: row.fieldMetadata,
            },
            diff: {
              fields: Object.fromEntries(
                Object.entries(row.fieldDiff).filter(
                  ([key]) => key !== "location",
                ),
              ),
              position: row.fieldDiff.location ?? null,
              provenance: {
                before:
                  row.previousRevisionId === null
                    ? []
                    : (provenance.get(row.previousRevisionId) ?? []),
                after: provenance.get(row.revisionId) ?? [],
              },
            },
          }
        : {
            visibility: "redacted",
            placeId: row.placeId,
            revisionId: row.revisionId,
          },
    );
    byChangeset.set(row.changesetId, changes);
  }
  return byChangeset;
}

function projectChangeset(
  row: CampusMapChangesetRow,
  changes: CampusMapPublicChangeset["changes"],
): CampusMapPublicChangeset {
  const hasOnlyPublicChanges =
    changes.length === row.affectedCount &&
    changes.every((change) => change.visibility === "public");
  const hasBbox =
    hasOnlyPublicChanges &&
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
    revertsChangesetId: row.revertsChangesetId,
    publishedAt: row.publishedAt,
    changes,
  };
}

/** Returns public Changeset/feed data; private publish-request rows are separate. */
export async function getCampusMapChangeset(
  changesetId: string,
): Promise<CampusMapPublicChangeset | null> {
  if (!isPublicId(changesetId)) return null;
  const [row] = await db
    .select(changesetSelection)
    .from(campusMapChangesets)
    .where(eq(campusMapChangesets.id, changesetId))
    .limit(1);
  if (!row) return null;

  const changes = await loadChangesByChangeset([changesetId]);
  return projectChangeset(row, changes.get(changesetId) ?? []);
}

export async function listCampusMapChangesets(options: {
  scope: CampusMapChangesetFeedScope;
  cursor?: string;
  limit?: number;
}): Promise<{
  items: CampusMapChangesetSummary[];
  nextCursor: string | null;
}> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions = [];
  const { scope } = options;
  if (scope.kind === "actor") {
    if (!isPublicId(scope.actorId)) {
      throw new CampusMapReadInputError("Invalid Campus Map actor ID");
    }
    conditions.push(eq(campusMapChangesets.actorIdSnapshot, scope.actorId));
  } else if (scope.kind === "reviewRequested") {
    conditions.push(eq(campusMapChangesets.reviewRequested, true));
  } else if (scope.kind === "bbox") {
    const { west, south, east, north } = scope.bounds;
    if (
      [west, south, east, north].some((value) => !Number.isFinite(value)) ||
      west < -180 ||
      east > 180 ||
      south < -90 ||
      north > 90 ||
      west > east ||
      south > north
    ) {
      throw new CampusMapReadInputError("Invalid Campus Map bounds");
    }
    conditions.push(
      hasOnlyPublicChanges,
      isNotNull(campusMapChangesets.bboxWest),
      isNotNull(campusMapChangesets.bboxSouth),
      isNotNull(campusMapChangesets.bboxEast),
      isNotNull(campusMapChangesets.bboxNorth),
      sql`box(
        point(${campusMapChangesets.bboxWest}, ${campusMapChangesets.bboxSouth}),
        point(${campusMapChangesets.bboxEast}, ${campusMapChangesets.bboxNorth})
      ) && box(point(${west}, ${south}), point(${east}, ${north}))`,
    );
  }
  const before = options.cursor ? decodeChangesetCursor(options.cursor) : null;
  if (before) {
    conditions.push(
      or(
        lt(campusMapChangesets.publishedAt, before.publishedAt),
        and(
          eq(campusMapChangesets.publishedAt, before.publishedAt),
          lt(campusMapChangesets.id, before.changesetId),
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
  const items = page.map(projectChangesetSummary);
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeChangesetCursor({
            publishedAt: last.publishedAt,
            changesetId: last.id,
          })
        : null,
  };
}

function projectChangesetSummary(
  row: CampusMapChangesetRow,
): CampusMapChangesetSummary {
  return {
    id: row.id,
    actor: { id: row.actorIdSnapshot, nickname: row.actorNicknameSnapshot },
    comment: row.comment,
    sourceSummary: row.sourceSummary,
    reviewRequested: row.reviewRequested,
    counts: {
      affected: row.affectedCount,
      created: row.createdCount,
      updated: row.updatedCount,
      retired: row.retiredCount,
      restored: row.restoredCount,
      merged: row.mergedCount,
    },
    bbox:
      row.hasOnlyPublicChanges &&
      row.bboxWest !== null &&
      row.bboxSouth !== null &&
      row.bboxEast !== null &&
      row.bboxNorth !== null
        ? {
            west: row.bboxWest,
            south: row.bboxSouth,
            east: row.bboxEast,
            north: row.bboxNorth,
          }
        : null,
    revertsChangesetId: row.revertsChangesetId,
    publishedAt: row.publishedAt,
  };
}

function encodeChangesetCursor(cursor: CampusMapChangesetFeedCursor): string {
  return Buffer.from(
    JSON.stringify([1, cursor.publishedAt.toISOString(), cursor.changesetId]),
  ).toString("base64url");
}

function decodeChangesetCursor(value: string): CampusMapChangesetFeedCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 3 ||
      decoded[0] !== 1 ||
      typeof decoded[1] !== "string" ||
      typeof decoded[2] !== "string" ||
      !isCampusMapUuid(decoded[2])
    ) {
      throw new Error("invalid shape");
    }
    const publishedAt = new Date(decoded[1]);
    if (Number.isNaN(publishedAt.getTime())) throw new Error("invalid date");
    return { publishedAt, changesetId: decoded[2] };
  } catch {
    throw new CampusMapReadInputError("Invalid Campus Map Changeset cursor");
  }
}
