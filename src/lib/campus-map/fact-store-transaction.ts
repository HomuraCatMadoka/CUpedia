import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  campusMapBuildings,
  campusMapChangesets,
  campusMapCurrentFacts,
  campusMapCurrentRevisions,
  campusMapFactRevisions,
  campusMapFactSchemas,
  campusMapPlaceChanges,
  campusMapPlaces,
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
  type CampusMapReservationRequirement,
  type CampusMapRevisionStatus,
  type CampusMapTemporaryStatus,
  type CampusMapWheelchairAccess,
} from "@/db/schema";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CampusMapCurrentRevisionState = {
  revisionId: string;
  status: "active" | "retired" | "merged";
} | null;

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

/**
 * Internal storage transaction for #718. It does not authenticate or validate
 * a publish command; it only protects the canonical pointer/projection seam.
 */
export class CampusMapFactStoreTransaction {
  constructor(private readonly transaction: DatabaseTransaction) {}

  async lockCurrentRevision(
    placeId: string,
  ): Promise<CampusMapCurrentRevisionState> {
    // Lock the stable identity as well, so first publication is serialized even
    // before a Current revision row exists.
    const [place] = await this.transaction
      .select({ id: campusMapPlaces.id })
      .from(campusMapPlaces)
      .where(eq(campusMapPlaces.id, placeId))
      .for("update")
      .limit(1);
    if (!place) throw new Error("Campus Map Place does not exist");

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

export function withCampusMapFactStoreTransaction<T>(
  work: (store: CampusMapFactStoreTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction((transaction) =>
    work(new CampusMapFactStoreTransaction(transaction)),
  );
}

export function appendCampusMapChangeset(
  command: CampusMapAppendChangesetCommand,
): Promise<{ changesetId: string }> {
  return withCampusMapFactStoreTransaction((store) =>
    store.appendChangeset(command),
  );
}
