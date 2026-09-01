import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  campusMapBuildings,
  campusMapChangesets,
  campusMapCurrentFacts,
  campusMapCurrentRevisions,
  campusMapFactRevisions,
  campusMapFactSchemas,
  campusMapPlaceChanges,
  campusMapPlaceFeedback,
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
  type CampusMapCoordinateConversionMethod,
  type CampusMapTemporaryStatus,
  type CampusMapWheelchairAccess,
} from "@/db/schema";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CampusMapCurrentRevisionState = {
  revisionId: string;
  status: "active" | "retired" | "merged";
} | null;

export interface CampusMapLockedRevisionSnapshot {
  revisionId: string;
  status: "active" | "retired" | "merged";
  factSchemaVersion: number;
  fact: CampusMapAppendFact;
  visibility: "public" | "redacted";
}

export interface CampusMapGovernanceRevisionSnapshot extends CampusMapLockedRevisionSnapshot {
  changesetId: string;
}

export interface CampusMapAppendFact {
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
  locationKind: CampusMapLocationKind;
  pointPrecision: CampusMapPointPrecision | null;
  longitude: number | null;
  latitude: number | null;
  coordinateCrs: "wgs84" | null;
  observedAt: Date | null;
  verifiedAt: Date | null;
  verifiedByActorIdSnapshot: string | null;
}

export interface CampusMapAppendProvenanceSource {
  kind: CampusMapProvenanceKind;
  ref: string;
  url: string | null;
  owner: string | null;
  version: string | null;
  snapshotHash: string | null;
  accessedOn: string;
  observedAt: Date | null;
  rightsStatus: CampusMapRightsStatus;
  limitations: string | null;
  note: string | null;
  sourceCoordinateX: number | null;
  sourceCoordinateY: number | null;
  sourceCoordinateCrs: CampusMapSourceCoordinateCrs | null;
  conversionMethod: CampusMapCoordinateConversionMethod | null;
  conversionVersion: string | null;
}

export interface CampusMapAppendPlaceChange {
  id: string;
  placeId: string;
  revisionId: string;
  baseRevisionId: string | null;
  operation: CampusMapPlaceOperation;
  factSchemaVersion: number;
  fieldMetadata: CampusMapFactDisplayMetadata;
  fieldDiff: CampusMapFieldDiff;
  status: CampusMapRevisionStatus;
  mergedIntoPlaceId: string | null;
  fact: CampusMapAppendFact;
  provenanceIds: string[];
  visibility:
    | { visibility: "public" }
    | { visibility: "redacted"; redactionRef: string; updatedBy?: string };
}

export interface CampusMapAppendChangesetCommand {
  id: string;
  actor: { userId: string | null; id: string; nickname: string };
  comment: string;
  sourceSummary: string;
  reviewRequested: boolean;
  client: { name: string; version: string };
  warningSummary: Array<{ code: string; count: number }>;
  revertsChangesetId: string | null;
  publishedAt: Date;
  changes: CampusMapAppendPlaceChange[];
}

export class CampusMapPublishConflictError extends Error {
  constructor(readonly placeId: string) {
    super(`Campus Map Place ${placeId} has a newer Current revision`);
    this.name = "CampusMapPublishConflictError";
  }
}

export class CampusMapMergedPlaceError extends Error {
  constructor(readonly placeId: string) {
    super(`Campus Map Place ${placeId} is a permanent merged redirect`);
    this.name = "CampusMapMergedPlaceError";
  }
}

export class CampusMapProvenanceIdentityConflictError extends Error {
  constructor(
    readonly kind: CampusMapProvenanceKind,
    readonly ref: string,
  ) {
    super(`Campus Map provenance ${kind}:${ref} has different metadata`);
    this.name = "CampusMapProvenanceIdentityConflictError";
  }
}

/**
 * Internal storage mechanism behind the application publish seam. It protects
 * provenance identity, the immutable ledger, and canonical projections; it
 * does not authenticate callers or validate a publish command.
 */
export class CampusMapFactStoreTransaction {
  constructor(private readonly transaction: DatabaseTransaction) {}

  async lockCurrentRevision(
    placeId: string,
  ): Promise<CampusMapCurrentRevisionState> {
    if (!(await this.lockPlace(placeId))) {
      throw new Error("Campus Map Place does not exist");
    }
    return this.readLockedCurrentRevision(placeId);
  }

  async lockCurrentRevisionSnapshot(
    placeId: string,
  ): Promise<CampusMapLockedRevisionSnapshot | null> {
    if (!(await this.lockPlace(placeId))) return null;
    const current = await this.readLockedCurrentRevision(placeId);
    if (!current) return null;
    const revision = await this.readRevisionSnapshot(
      placeId,
      current.revisionId,
    );
    if (!revision) {
      throw new Error("Campus Map Current revision snapshot does not exist");
    }
    return {
      revisionId: revision.revisionId,
      status: current.status,
      factSchemaVersion: revision.factSchemaVersion,
      fact: revision.fact,
      visibility: revision.visibility,
    };
  }

  async lockGovernanceRevisionSnapshots(
    references: readonly { placeId: string; revisionId: string }[],
  ): Promise<(CampusMapGovernanceRevisionSnapshot | null)[]> {
    const placeIds = [
      ...new Set(references.map((reference) => reference.placeId)),
    ].sort((left, right) => left.localeCompare(right));
    for (const placeId of placeIds) {
      await this.lockCurrentRevisionSnapshot(placeId);
    }

    const snapshots = new Map<
      string,
      CampusMapGovernanceRevisionSnapshot | null
    >();
    const orderedReferences = [...references].sort((left, right) =>
      left.revisionId.localeCompare(right.revisionId),
    );
    for (const reference of orderedReferences) {
      const key = `${reference.placeId}\u0000${reference.revisionId}`;
      if (!snapshots.has(key)) {
        snapshots.set(
          key,
          await this.readRevisionSnapshot(
            reference.placeId,
            reference.revisionId,
          ),
        );
      }
    }
    return references.map(
      (reference) =>
        snapshots.get(`${reference.placeId}\u0000${reference.revisionId}`) ??
        null,
    );
  }

  private async readRevisionSnapshot(
    placeId: string,
    revisionId: string,
  ): Promise<CampusMapGovernanceRevisionSnapshot | null> {
    const [revision] = await this.transaction
      .select({
        visibility: campusMapRevisionVisibility.visibility,
        changesetId: campusMapFactRevisions.changesetId,
        status: campusMapFactRevisions.status,
        factSchemaVersion: campusMapFactRevisions.factSchemaVersion,
        name: campusMapFactRevisions.name,
        buildingId: campusMapFactRevisions.buildingId,
        floorId: campusMapFactRevisions.floorId,
        pinType: campusMapFactRevisions.pinType,
        capabilities: campusMapFactRevisions.capabilities,
        gender: campusMapFactRevisions.gender,
        wheelchairAccess: campusMapFactRevisions.wheelchairAccess,
        audience: campusMapFactRevisions.audience,
        credentialRequirement: campusMapFactRevisions.credentialRequirement,
        accessSchedule: campusMapFactRevisions.accessSchedule,
        reservationRequirement: campusMapFactRevisions.reservationRequirement,
        temporaryStatus: campusMapFactRevisions.temporaryStatus,
        locationKind: campusMapFactRevisions.locationKind,
        pointPrecision: campusMapFactRevisions.pointPrecision,
        longitude: campusMapFactRevisions.longitude,
        latitude: campusMapFactRevisions.latitude,
        coordinateCrs: campusMapFactRevisions.coordinateCrs,
        observedAt: campusMapFactRevisions.observedAt,
        verifiedAt: campusMapFactRevisions.verifiedAt,
        verifiedByActorIdSnapshot:
          campusMapFactRevisions.verifiedByActorIdSnapshot,
      })
      .from(campusMapFactRevisions)
      .innerJoin(
        campusMapRevisionVisibility,
        eq(campusMapFactRevisions.id, campusMapRevisionVisibility.revisionId),
      )
      .where(
        and(
          eq(campusMapFactRevisions.placeId, placeId),
          eq(campusMapFactRevisions.id, revisionId),
        ),
      )
      .for("update", { of: campusMapRevisionVisibility })
      .limit(1);
    if (!revision) return null;
    if (
      revision.status !== "active" &&
      revision.status !== "retired" &&
      revision.status !== "merged"
    ) {
      throw new Error("Campus Map revision status is invalid");
    }
    if (
      revision.visibility !== "public" &&
      revision.visibility !== "redacted"
    ) {
      throw new Error("Campus Map revision visibility is invalid");
    }
    return {
      revisionId,
      changesetId: revision.changesetId,
      status: revision.status,
      factSchemaVersion: revision.factSchemaVersion,
      fact: {
        name: revision.name,
        buildingId: revision.buildingId,
        floorId: revision.floorId,
        pinType: revision.pinType,
        capabilities: revision.capabilities,
        gender: revision.gender,
        wheelchairAccess: revision.wheelchairAccess,
        audience: revision.audience,
        credentialRequirement: revision.credentialRequirement,
        accessSchedule: revision.accessSchedule,
        reservationRequirement: revision.reservationRequirement,
        temporaryStatus: revision.temporaryStatus,
        locationKind: revision.locationKind,
        pointPrecision: revision.pointPrecision,
        longitude: revision.longitude,
        latitude: revision.latitude,
        coordinateCrs: revision.coordinateCrs,
        observedAt: revision.observedAt,
        verifiedAt: revision.verifiedAt,
        verifiedByActorIdSnapshot: revision.verifiedByActorIdSnapshot,
      },
      visibility: revision.visibility,
    };
  }

  private async lockPlace(placeId: string): Promise<boolean> {
    // Lock the stable identity as well, so first publication is serialized even
    // before a Current revision row exists.
    const [place] = await this.transaction
      .select({ id: campusMapPlaces.id })
      .from(campusMapPlaces)
      .where(eq(campusMapPlaces.id, placeId))
      .for("update")
      .limit(1);
    return place !== undefined;
  }

  private async readLockedCurrentRevision(
    placeId: string,
  ): Promise<CampusMapCurrentRevisionState> {
    const [current] = await this.transaction
      .select({
        revisionId: campusMapCurrentRevisions.revisionId,
        status: campusMapCurrentRevisions.status,
      })
      .from(campusMapCurrentRevisions)
      .where(eq(campusMapCurrentRevisions.placeId, placeId))
      .for("update")
      .limit(1);

    if (!current) return null;
    if (
      current.status !== "active" &&
      current.status !== "retired" &&
      current.status !== "merged"
    ) {
      throw new Error("Campus Map Current revision has an invalid status");
    }
    return { revisionId: current.revisionId, status: current.status };
  }

  async validateProvenanceSources(
    sources: CampusMapAppendProvenanceSource[],
  ): Promise<void> {
    await this.lockAndValidateProvenanceSources(sources);
  }

  async resolveProvenanceSources(
    sources: CampusMapAppendProvenanceSource[],
  ): Promise<string[]> {
    const { uniqueSources, existingByIdentity } =
      await this.lockAndValidateProvenanceSources(sources);
    const idByIdentity = new Map<string, string>();
    for (const source of uniqueSources) {
      const identity = provenanceIdentity(source);
      const alreadyStored = existingByIdentity.get(identity);
      if (alreadyStored) {
        idByIdentity.set(identity, alreadyStored.id);
        continue;
      }
      const [inserted] = await this.transaction
        .insert(campusMapProvenanceSources)
        .values({
          id: randomUUID(),
          sourceKind: source.kind,
          sourceRef: source.ref,
          sourceUrl: source.url,
          sourceOwner: source.owner,
          sourceVersion: source.version,
          snapshotHash: source.snapshotHash,
          accessedOn: source.accessedOn,
          observedAt: source.observedAt,
          rightsStatus: source.rightsStatus,
          limitations: source.limitations,
          note: source.note,
          sourceCoordinateX: source.sourceCoordinateX,
          sourceCoordinateY: source.sourceCoordinateY,
          sourceCoordinateCrs: source.sourceCoordinateCrs,
          conversionMethod: source.conversionMethod,
          conversionVersion: source.conversionVersion,
        })
        .onConflictDoNothing({
          target: [
            campusMapProvenanceSources.sourceKind,
            campusMapProvenanceSources.sourceRef,
          ],
        })
        .returning({ id: campusMapProvenanceSources.id });
      if (inserted) {
        idByIdentity.set(identity, inserted.id);
        continue;
      }
      const [raced] = await this.transaction
        .select(provenanceSourceSelection)
        .from(campusMapProvenanceSources)
        .where(
          and(
            eq(campusMapProvenanceSources.sourceKind, source.kind),
            eq(campusMapProvenanceSources.sourceRef, source.ref),
          ),
        )
        .limit(1);
      if (!raced) throw new Error("Campus Map provenance disappeared");
      if (!sameProvenanceMetadata(source, raced)) {
        throw new CampusMapProvenanceIdentityConflictError(
          source.kind,
          source.ref,
        );
      }
      idByIdentity.set(identity, raced.id);
    }
    return sources.map((source) => {
      const id = idByIdentity.get(provenanceIdentity(source));
      if (!id) throw new Error("Campus Map provenance was not resolved");
      return id;
    });
  }

  private async lockAndValidateProvenanceSources(
    sources: CampusMapAppendProvenanceSource[],
  ): Promise<{
    uniqueSources: CampusMapAppendProvenanceSource[];
    existingByIdentity: Map<string, StoredProvenanceSource>;
  }> {
    if (sources.length === 0) {
      throw new Error("Campus Map revision requires provenance");
    }
    const uniqueByIdentity = new Map<string, CampusMapAppendProvenanceSource>();
    for (const source of sources) {
      const identity = provenanceIdentity(source);
      const existing = uniqueByIdentity.get(identity);
      if (existing && !sameProvenanceMetadata(existing, source)) {
        throw new CampusMapProvenanceIdentityConflictError(
          source.kind,
          source.ref,
        );
      }
      uniqueByIdentity.set(identity, existing ?? source);
    }
    const uniqueSources = [...uniqueByIdentity.values()];
    const locks = uniqueSources
      .map((source) => provenanceLockKey(provenanceIdentity(source)))
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    for (const lockKey of locks) {
      await this.transaction.execute(
        sql`select pg_advisory_xact_lock(${lockKey.toString()}::bigint)`,
      );
    }

    const existingSources = await this.transaction
      .select(provenanceSourceSelection)
      .from(campusMapProvenanceSources)
      .where(
        or(
          ...uniqueSources.map((source) =>
            and(
              eq(campusMapProvenanceSources.sourceKind, source.kind),
              eq(campusMapProvenanceSources.sourceRef, source.ref),
            ),
          ),
        ),
      );
    const existingByIdentity = new Map<string, StoredProvenanceSource>(
      existingSources.map((source) => [
        provenanceIdentity({ kind: source.sourceKind, ref: source.sourceRef }),
        source,
      ]),
    );
    for (const source of uniqueSources) {
      const existing = existingByIdentity.get(provenanceIdentity(source));
      if (existing && !sameProvenanceMetadata(source, existing)) {
        throw new CampusMapProvenanceIdentityConflictError(
          source.kind,
          source.ref,
        );
      }
    }
    return { uniqueSources, existingByIdentity };
  }

  async appendChangeset(
    command: CampusMapAppendChangesetCommand,
  ): Promise<{ changesetId: string }> {
    if (command.changes.length === 0) {
      throw new Error("Campus Map Changeset must contain at least one change");
    }
    if (command.changes.some((change) => change.factSchemaVersion === 1)) {
      const [existingV1] = await this.transaction
        .select({ status: campusMapFactSchemas.status })
        .from(campusMapFactSchemas)
        .where(eq(campusMapFactSchemas.version, 1))
        .limit(1);
      if (!existingV1) {
        await this.transaction
          .insert(campusMapFactSchemas)
          .values({
            version: 1,
            status: "active",
            definition: CAMPUS_MAP_FACT_SCHEMA_V1,
            displayMetadata: CAMPUS_MAP_FACT_DISPLAY_METADATA_V1,
          })
          .onConflictDoNothing();
      }
      const [canonicalV1] = await this.transaction
        .select({ status: campusMapFactSchemas.status })
        .from(campusMapFactSchemas)
        .where(eq(campusMapFactSchemas.version, 1))
        .limit(1);
      if (canonicalV1?.status !== "active") {
        throw new Error("Campus Map canonical fact schema v1 is not active");
      }
    }
    const orderedChanges = [...command.changes].sort((left, right) =>
      left.placeId.localeCompare(right.placeId),
    );
    if (
      new Set(orderedChanges.map((change) => change.placeId)).size !==
      orderedChanges.length
    ) {
      throw new Error("Campus Map Changeset contains duplicate Place changes");
    }

    for (const change of orderedChanges) {
      if (change.provenanceIds.length === 0) {
        throw new Error("Campus Map revision requires provenance");
      }
      if (change.operation === "create") {
        const inserted = await this.transaction
          .insert(campusMapPlaces)
          .values({ id: change.placeId })
          .onConflictDoNothing({ target: campusMapPlaces.id })
          .returning({ id: campusMapPlaces.id });
        if (inserted.length === 0) {
          throw new CampusMapPublishConflictError(change.placeId);
        }
      }
    }

    const changeByPlace = new Map(
      orderedChanges.map((change) => [change.placeId, change]),
    );
    const lockedPlaceIds = [
      ...new Set(
        orderedChanges.flatMap((change) =>
          change.operation === "merge" && change.mergedIntoPlaceId
            ? [change.placeId, change.mergedIntoPlaceId]
            : [change.placeId],
        ),
      ),
    ].sort((left, right) => left.localeCompare(right));
    const currentByPlace = new Map<string, CampusMapCurrentRevisionState>();
    for (const placeId of lockedPlaceIds) {
      currentByPlace.set(placeId, await this.lockCurrentRevision(placeId));
    }

    for (const change of orderedChanges) {
      const current = currentByPlace.get(change.placeId) ?? null;
      if ((current?.revisionId ?? null) !== change.baseRevisionId) {
        throw new CampusMapPublishConflictError(change.placeId);
      }
      if (current?.status === "merged") {
        throw new CampusMapMergedPlaceError(change.placeId);
      }
      if (change.operation === "create") {
        if (current !== null || change.status !== "active") {
          throw new Error("Campus Map create must establish an active Place");
        }
      } else if (!current) {
        throw new CampusMapPublishConflictError(change.placeId);
      } else if (
        (change.operation === "retire" &&
          (current.status !== "active" || change.status !== "retired")) ||
        (change.operation === "restore" &&
          (current.status !== "retired" || change.status !== "active")) ||
        (change.operation === "merge" && change.status !== "merged") ||
        (change.operation === "update" &&
          (current.status !== "active" || change.status !== "active"))
      ) {
        throw new Error(
          "Campus Map operation and revision status do not match",
        );
      }
      if (change.operation === "merge") {
        const survivorId = change.mergedIntoPlaceId;
        const survivor = survivorId
          ? currentByPlace.get(survivorId)
          : undefined;
        const survivorChange = survivorId
          ? changeByPlace.get(survivorId)
          : undefined;
        if (
          !survivorId ||
          survivor?.status !== "active" ||
          (survivorChange !== undefined && survivorChange.status !== "active")
        ) {
          throw new Error("Campus Map merge survivor must remain active");
        }
      }
    }

    const mergeChanges = orderedChanges.filter(
      (
        change,
      ): change is CampusMapAppendPlaceChange & {
        operation: "merge";
        mergedIntoPlaceId: string;
      } => change.operation === "merge" && change.mergedIntoPlaceId !== null,
    );
    if (mergeChanges.length > 0) {
      const feedbackPlaceIds = [
        ...new Set(
          mergeChanges.flatMap((change) => [
            change.placeId,
            change.mergedIntoPlaceId,
          ]),
        ),
      ].sort((left, right) => left.localeCompare(right));
      await this.transaction
        .select({ id: campusMapPlaceFeedback.id })
        .from(campusMapPlaceFeedback)
        .where(inArray(campusMapPlaceFeedback.placeId, feedbackPlaceIds))
        .orderBy(
          campusMapPlaceFeedback.placeId,
          campusMapPlaceFeedback.userId,
          campusMapPlaceFeedback.id,
        )
        .for("update");
      for (const change of mergeChanges) {
        await this.transaction.execute(sql`
          update campus_map_place_feedback as loser_feedback
             set place_id = ${change.mergedIntoPlaceId}
           where loser_feedback.place_id = ${change.placeId}
             and not exists (
               select 1
                 from campus_map_place_feedback as survivor_feedback
                where survivor_feedback.place_id = ${change.mergedIntoPlaceId}
                  and survivor_feedback.user_id = loser_feedback.user_id
             )
        `);
      }
    }

    const buildingIds = [
      ...new Set(
        orderedChanges
          .map((change) => change.fact.buildingId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const anchors =
      buildingIds.length === 0
        ? []
        : await this.transaction
            .select({
              id: campusMapBuildings.id,
              longitude: campusMapBuildings.anchorLongitude,
              latitude: campusMapBuildings.anchorLatitude,
              crs: campusMapBuildings.anchorCrs,
            })
            .from(campusMapBuildings)
            .where(inArray(campusMapBuildings.id, buildingIds));
    const anchorByBuilding = new Map(
      anchors.map((anchor) => [anchor.id, anchor]),
    );
    const points = orderedChanges.flatMap((change) => {
      if (
        change.fact.locationKind === "outdoor-point" &&
        change.fact.longitude !== null &&
        change.fact.latitude !== null
      ) {
        return [
          { longitude: change.fact.longitude, latitude: change.fact.latitude },
        ];
      }
      const anchor = change.fact.buildingId
        ? anchorByBuilding.get(change.fact.buildingId)
        : undefined;
      return anchor?.crs === "wgs84" &&
        anchor.longitude !== null &&
        anchor.latitude !== null
        ? [{ longitude: anchor.longitude, latitude: anchor.latitude }]
        : [];
    });
    const bbox =
      points.length === 0
        ? null
        : {
            west: Math.min(...points.map((point) => point.longitude)),
            south: Math.min(...points.map((point) => point.latitude)),
            east: Math.max(...points.map((point) => point.longitude)),
            north: Math.max(...points.map((point) => point.latitude)),
          };
    const count = (operation: CampusMapPlaceOperation) =>
      orderedChanges.filter((change) => change.operation === operation).length;

    await this.transaction.insert(campusMapChangesets).values({
      id: command.id,
      actorUserId: command.actor.userId,
      actorIdSnapshot: command.actor.id,
      actorNicknameSnapshot: command.actor.nickname,
      comment: command.comment,
      sourceSummary: command.sourceSummary,
      reviewRequested: command.reviewRequested,
      clientName: command.client.name,
      clientVersion: command.client.version,
      affectedCount: orderedChanges.length,
      createdCount: count("create"),
      updatedCount: count("update"),
      retiredCount: count("retire"),
      restoredCount: count("restore"),
      mergedCount: count("merge"),
      bboxWest: bbox?.west ?? null,
      bboxSouth: bbox?.south ?? null,
      bboxEast: bbox?.east ?? null,
      bboxNorth: bbox?.north ?? null,
      warningSummary: command.warningSummary,
      revertsChangesetId: command.revertsChangesetId,
      publishedAt: command.publishedAt,
    });

    for (const change of orderedChanges) {
      await this.transaction.insert(campusMapPlaceChanges).values({
        id: change.id,
        changesetId: command.id,
        placeId: change.placeId,
        operation: change.operation,
        fieldDiff: change.fieldDiff,
      });
      await this.transaction.insert(campusMapFactRevisions).values({
        id: change.revisionId,
        placeId: change.placeId,
        changesetId: command.id,
        placeChangeId: change.id,
        previousRevisionId: change.baseRevisionId,
        factSchemaVersion: change.factSchemaVersion,
        fieldMetadata: change.fieldMetadata,
        status: change.status,
        mergedIntoPlaceId: change.mergedIntoPlaceId,
        actorIdSnapshot: command.actor.id,
        actorNicknameSnapshot: command.actor.nickname,
        ...change.fact,
      });
      await this.transaction.insert(campusMapRevisionProvenance).values(
        change.provenanceIds.map((provenanceId) => ({
          revisionId: change.revisionId,
          provenanceId,
        })),
      );
      await this.transaction.insert(campusMapRevisionVisibility).values({
        revisionId: change.revisionId,
        visibility: change.visibility.visibility,
        redactionRef:
          change.visibility.visibility === "redacted"
            ? change.visibility.redactionRef
            : null,
        updatedBy:
          change.visibility.visibility === "redacted"
            ? (change.visibility.updatedBy ?? null)
            : null,
      });

      // Remove the child projection before advancing its immediate FK parent.
      await this.transaction
        .delete(campusMapCurrentFacts)
        .where(eq(campusMapCurrentFacts.placeId, change.placeId));
      const current = currentByPlace.get(change.placeId);
      if (current) {
        await this.transaction
          .update(campusMapCurrentRevisions)
          .set({
            revisionId: change.revisionId,
            status: change.status,
            advancedAt: command.publishedAt,
          })
          .where(eq(campusMapCurrentRevisions.placeId, change.placeId));
      } else {
        await this.transaction.insert(campusMapCurrentRevisions).values({
          placeId: change.placeId,
          revisionId: change.revisionId,
          status: change.status,
          advancedAt: command.publishedAt,
        });
      }
      if (change.status === "active") {
        await this.transaction.insert(campusMapCurrentFacts).values({
          placeId: change.placeId,
          revisionId: change.revisionId,
          status: "active",
          factSchemaVersion: change.factSchemaVersion,
          ...change.fact,
          publishedAt: command.publishedAt,
        });
      }
    }

    return { changesetId: command.id };
  }
}

const provenanceSourceSelection = {
  id: campusMapProvenanceSources.id,
  sourceKind: campusMapProvenanceSources.sourceKind,
  sourceRef: campusMapProvenanceSources.sourceRef,
  sourceUrl: campusMapProvenanceSources.sourceUrl,
  sourceOwner: campusMapProvenanceSources.sourceOwner,
  sourceVersion: campusMapProvenanceSources.sourceVersion,
  snapshotHash: campusMapProvenanceSources.snapshotHash,
  accessedOn: campusMapProvenanceSources.accessedOn,
  observedAt: campusMapProvenanceSources.observedAt,
  rightsStatus: campusMapProvenanceSources.rightsStatus,
  limitations: campusMapProvenanceSources.limitations,
  note: campusMapProvenanceSources.note,
  sourceCoordinateX: campusMapProvenanceSources.sourceCoordinateX,
  sourceCoordinateY: campusMapProvenanceSources.sourceCoordinateY,
  sourceCoordinateCrs: campusMapProvenanceSources.sourceCoordinateCrs,
  conversionMethod: campusMapProvenanceSources.conversionMethod,
  conversionVersion: campusMapProvenanceSources.conversionVersion,
};

type StoredProvenanceSource = {
  id: string;
  sourceKind: CampusMapProvenanceKind;
  sourceRef: string;
  sourceUrl: string | null;
  sourceOwner: string | null;
  sourceVersion: string | null;
  snapshotHash: string | null;
  accessedOn: string;
  observedAt: Date | null;
  rightsStatus: CampusMapRightsStatus;
  limitations: string | null;
  note: string | null;
  sourceCoordinateX: number | null;
  sourceCoordinateY: number | null;
  sourceCoordinateCrs: CampusMapSourceCoordinateCrs | null;
  conversionMethod: CampusMapCoordinateConversionMethod | null;
  conversionVersion: string | null;
};

function provenanceIdentity(source: {
  kind: CampusMapProvenanceKind;
  ref: string;
}): string {
  return `${source.kind}\u0000${source.ref}`;
}

function provenanceLockKey(identity: string): bigint {
  return createHash("sha256")
    .update(`provenance-source\u0000${identity}`, "utf8")
    .digest()
    .readBigInt64BE(0);
}

function sameProvenanceMetadata(
  left: CampusMapAppendProvenanceSource,
  right: CampusMapAppendProvenanceSource | StoredProvenanceSource,
): boolean {
  return (
    JSON.stringify(normalizedProvenanceMetadata(left)) ===
    JSON.stringify(normalizedProvenanceMetadata(right))
  );
}

function normalizedProvenanceMetadata(
  source:
    | CampusMapAppendProvenanceSource
    | Pick<
        StoredProvenanceSource,
        | "sourceUrl"
        | "sourceOwner"
        | "sourceVersion"
        | "snapshotHash"
        | "accessedOn"
        | "observedAt"
        | "rightsStatus"
        | "limitations"
        | "note"
        | "sourceCoordinateX"
        | "sourceCoordinateY"
        | "sourceCoordinateCrs"
        | "conversionMethod"
        | "conversionVersion"
      >,
) {
  if ("kind" in source) {
    return {
      url: source.url,
      owner: source.owner,
      version: source.version,
      snapshotHash: source.snapshotHash,
      accessedOn: source.accessedOn,
      observedAt: source.observedAt?.toISOString() ?? null,
      rightsStatus: source.rightsStatus,
      limitations: source.limitations,
      note: source.note,
      sourceCoordinateX: source.sourceCoordinateX,
      sourceCoordinateY: source.sourceCoordinateY,
      sourceCoordinateCrs: source.sourceCoordinateCrs,
      conversionMethod: source.conversionMethod,
      conversionVersion: source.conversionVersion,
    };
  }
  return {
    url: source.sourceUrl,
    owner: source.sourceOwner,
    version: source.sourceVersion,
    snapshotHash: source.snapshotHash,
    accessedOn: source.accessedOn,
    observedAt: source.observedAt?.toISOString() ?? null,
    rightsStatus: source.rightsStatus,
    limitations: source.limitations,
    note: source.note,
    sourceCoordinateX: source.sourceCoordinateX,
    sourceCoordinateY: source.sourceCoordinateY,
    sourceCoordinateCrs: source.sourceCoordinateCrs,
    conversionMethod: source.conversionMethod,
    conversionVersion: source.conversionVersion,
  };
}

export function withCampusMapFactStoreTransaction<T>(
  work: (store: CampusMapFactStoreTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction((transaction) =>
    work(new CampusMapFactStoreTransaction(transaction)),
  );
}
