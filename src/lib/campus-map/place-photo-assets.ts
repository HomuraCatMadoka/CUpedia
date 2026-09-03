import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, lte, notExists, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  campusMapPlacePhotoAssets,
  campusMapPlacePhotoUploadLimits,
  campusMapRevisionPhotos,
} from "@/db/schema";
import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  CampusMapPlacePhotoError,
  processCampusMapPlacePhoto,
} from "@/lib/campus-map/place-photo-processing";
import {
  CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT,
  toCampusMapPlacePhotoView,
  type CampusMapPlacePhotoAssetView,
} from "@/lib/campus-map/place-photos-contract";
import { deletePrivateObjects, putPrivateObject } from "@/lib/minio";

const MAX_UPLOADS_PER_HOUR = 18;
const PENDING_TTL_MS = 60 * 60 * 1000;
const PROCESSING_VERSION = 1;
const UPLOAD_LEASE_MS = 60_000;
const CONCURRENT_UPLOAD_WAIT_MS = 5_000;
const CONCURRENT_UPLOAD_POLL_MS = 100;

export async function uploadCampusMapPlacePhoto(input: {
  actorId: string;
  assetId: string;
  source: Buffer;
  now?: Date;
  putStoredObject?: typeof putPrivateObject;
  deleteStoredObjects?: (keys: string[]) => Promise<void>;
}): Promise<CampusMapPlacePhotoAssetView> {
  const actorId = input.actorId.toLowerCase();
  const assetId = input.assetId.toLowerCase();
  if (
    !isCanonicalCampusMapUuid(actorId) ||
    !isCanonicalCampusMapUuid(assetId)
  ) {
    throw new CampusMapPlacePhotoError("photo-invalid-id");
  }
  const now = input.now ?? new Date();
  await consumeCampusMapPlacePhotoUploadAttempt(actorId, now);
  const processed = await processCampusMapPlacePhoto(input.source);
  const expiresAt = new Date(now.getTime() + PENDING_TTL_MS);
  const uploadToken = randomUUID();
  const uploadLeaseExpiresAt = new Date(now.getTime() + UPLOAD_LEASE_MS);
  const fullObjectKey = `campus-map/place-photos/${assetId}/full.webp`;
  const thumbnailObjectKey = `campus-map/place-photos/${assetId}/thumbnail.webp`;

  const reserved = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`campus-map-place-photos-asset:${assetId}`}, 0))`,
    );
    const [existing] = await transaction
      .select()
      .from(campusMapPlacePhotoAssets)
      .where(eq(campusMapPlacePhotoAssets.id, assetId))
      .for("update")
      .limit(1);
    if (existing) {
      if (
        existing.ownerUserId !== actorId ||
        existing.sourceSha256 !== processed.sourceSha256 ||
        existing.status === "deleting"
      ) {
        throw new CampusMapPlacePhotoError("photo-invalid-id");
      }
      if (existing.status === "ready") {
        return { kind: "ready" as const, row: existing };
      }
      if (
        existing.uploadLeaseExpiresAt &&
        existing.uploadLeaseExpiresAt > now
      ) {
        return { kind: "waiting" as const };
      }
      const [claimed] = await transaction
        .update(campusMapPlacePhotoAssets)
        .set({
          uploadToken,
          uploadLeaseExpiresAt,
          expiresAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(campusMapPlacePhotoAssets.id, assetId),
            eq(campusMapPlacePhotoAssets.status, "pending"),
          ),
        )
        .returning();
      if (!claimed) return { kind: "waiting" as const };
      return { kind: "owned" as const };
    }

    await transaction.insert(campusMapPlacePhotoAssets).values({
      id: assetId,
      ownerUserId: actorId,
      sourceSha256: processed.sourceSha256,
      fullObjectKey,
      thumbnailObjectKey,
      fullWidth: processed.full.width,
      fullHeight: processed.full.height,
      fullByteSize: processed.full.body.byteLength,
      thumbnailWidth: processed.thumbnail.width,
      thumbnailHeight: processed.thumbnail.height,
      thumbnailByteSize: processed.thumbnail.body.byteLength,
      processingVersion: PROCESSING_VERSION,
      status: "pending",
      uploadToken,
      uploadLeaseExpiresAt,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return { kind: "owned" as const };
  });

  if (reserved.kind === "ready") {
    return toCampusMapPlacePhotoView(reserved.row);
  }
  if (reserved.kind === "waiting") {
    const ready = await waitForReadyCampusMapPlacePhoto(
      assetId,
      actorId,
      processed.sourceSha256,
    );
    if (ready) return toCampusMapPlacePhotoView(ready);
    throw new CampusMapPlacePhotoError("photo-upload-failed");
  }

  try {
    const putStoredObject = input.putStoredObject ?? putPrivateObject;
    await putStoredObject(
      fullObjectKey,
      processed.full.body,
      "image/webp",
      "private, no-store",
    );
    await putStoredObject(
      thumbnailObjectKey,
      processed.thumbnail.body,
      "image/webp",
      "private, no-store",
    );
    const [ready] = await db
      .update(campusMapPlacePhotoAssets)
      .set({
        status: "ready",
        uploadToken: null,
        uploadLeaseExpiresAt: null,
        readyAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(campusMapPlacePhotoAssets.id, assetId),
          eq(campusMapPlacePhotoAssets.ownerUserId, actorId),
          eq(campusMapPlacePhotoAssets.status, "pending"),
          eq(campusMapPlacePhotoAssets.uploadToken, uploadToken),
        ),
      )
      .returning();
    if (ready) return toCampusMapPlacePhotoView(ready);
    const concurrentReady = await readReadyCampusMapPlacePhoto(
      assetId,
      actorId,
      processed.sourceSha256,
    );
    if (concurrentReady) {
      return toCampusMapPlacePhotoView(concurrentReady);
    }
    throw new CampusMapPlacePhotoError("photo-upload-failed");
  } catch {
    try {
      const [claimed] = await db
        .update(campusMapPlacePhotoAssets)
        .set({
          status: "deleting",
          uploadToken: null,
          uploadLeaseExpiresAt: null,
          expiresAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(campusMapPlacePhotoAssets.id, assetId),
            eq(campusMapPlacePhotoAssets.ownerUserId, actorId),
            eq(campusMapPlacePhotoAssets.status, "pending"),
            eq(campusMapPlacePhotoAssets.uploadToken, uploadToken),
          ),
        )
        .returning({
          id: campusMapPlacePhotoAssets.id,
          fullObjectKey: campusMapPlacePhotoAssets.fullObjectKey,
          thumbnailObjectKey: campusMapPlacePhotoAssets.thumbnailObjectKey,
        });
      if (claimed) {
        await deleteClaimedCampusMapPlacePhotoAssets(
          [claimed],
          input.deleteStoredObjects ?? deletePrivateObjects,
        );
      }
    } catch {
      // A daily reconciliation pass retries rows left in `deleting`.
    }
    throw new CampusMapPlacePhotoError("photo-upload-failed");
  }
}

interface ClaimedCampusMapPlacePhotoAsset {
  id: string;
  fullObjectKey: string;
  thumbnailObjectKey: string;
}

async function deleteClaimedCampusMapPlacePhotoAssets(
  claimed: readonly ClaimedCampusMapPlacePhotoAsset[],
  deleteStoredObjects: (keys: string[]) => Promise<void>,
) {
  if (claimed.length === 0) return { deleted: 0 };
  await deleteStoredObjects(
    claimed.flatMap((row) => [row.fullObjectKey, row.thumbnailObjectKey]),
  );
  const deleted = await db
    .delete(campusMapPlacePhotoAssets)
    .where(
      and(
        inArray(
          campusMapPlacePhotoAssets.id,
          claimed.map((row) => row.id),
        ),
        eq(campusMapPlacePhotoAssets.status, "deleting"),
        notExists(
          db
            .select({ assetId: campusMapRevisionPhotos.assetId })
            .from(campusMapRevisionPhotos)
            .where(
              eq(campusMapRevisionPhotos.assetId, campusMapPlacePhotoAssets.id),
            ),
        ),
      ),
    )
    .returning({ id: campusMapPlacePhotoAssets.id });
  return { deleted: deleted.length };
}

export async function discardCampusMapPlacePhotoAssets(input: {
  actorId: string;
  assetIds: readonly string[];
  now?: Date;
  deleteStoredObjects?: (keys: string[]) => Promise<void>;
}) {
  const actorId = input.actorId.toLowerCase();
  const assetIds = [...new Set(input.assetIds.map((id) => id.toLowerCase()))];
  if (
    !isCanonicalCampusMapUuid(actorId) ||
    assetIds.length > CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT ||
    !assetIds.every(isCanonicalCampusMapUuid)
  ) {
    throw new CampusMapPlacePhotoError("photo-invalid-id");
  }
  if (assetIds.length === 0) return { deleted: 0 };
  const now = input.now ?? new Date();
  const claimed = await db.transaction(async (transaction) => {
    const rows = await transaction
      .select({
        id: campusMapPlacePhotoAssets.id,
        fullObjectKey: campusMapPlacePhotoAssets.fullObjectKey,
        thumbnailObjectKey: campusMapPlacePhotoAssets.thumbnailObjectKey,
      })
      .from(campusMapPlacePhotoAssets)
      .where(
        and(
          inArray(campusMapPlacePhotoAssets.id, assetIds),
          eq(campusMapPlacePhotoAssets.ownerUserId, actorId),
          eq(campusMapPlacePhotoAssets.status, "ready"),
          isNotNull(campusMapPlacePhotoAssets.expiresAt),
          notExists(
            transaction
              .select({ assetId: campusMapRevisionPhotos.assetId })
              .from(campusMapRevisionPhotos)
              .where(
                eq(
                  campusMapRevisionPhotos.assetId,
                  campusMapPlacePhotoAssets.id,
                ),
              ),
          ),
        ),
      )
      .orderBy(campusMapPlacePhotoAssets.id)
      .for("update");
    if (rows.length === 0) return rows;
    await transaction
      .update(campusMapPlacePhotoAssets)
      .set({
        status: "deleting",
        expiresAt: now,
        updatedAt: now,
      })
      .where(
        inArray(
          campusMapPlacePhotoAssets.id,
          rows.map((row) => row.id),
        ),
      );
    return rows;
  });
  return deleteClaimedCampusMapPlacePhotoAssets(
    claimed,
    input.deleteStoredObjects ?? deletePrivateObjects,
  );
}

async function consumeCampusMapPlacePhotoUploadAttempt(
  actorId: string,
  now: Date,
) {
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`campus-map-place-photos-rate:${actorId}`}, 0))`,
    );
    const [current] = await transaction
      .select()
      .from(campusMapPlacePhotoUploadLimits)
      .where(eq(campusMapPlacePhotoUploadLimits.actorUserId, actorId))
      .for("update")
      .limit(1);
    if (!current) {
      await transaction.insert(campusMapPlacePhotoUploadLimits).values({
        actorUserId: actorId,
        windowStartedAt: now,
        attemptCount: 1,
        updatedAt: now,
      });
      return;
    }
    const windowExpired =
      current.windowStartedAt.getTime() <= now.getTime() - 60 * 60 * 1000;
    if (!windowExpired && current.attemptCount >= MAX_UPLOADS_PER_HOUR) {
      throw new CampusMapPlacePhotoError("photo-upload-rate-limited");
    }
    await transaction
      .update(campusMapPlacePhotoUploadLimits)
      .set(
        windowExpired
          ? { windowStartedAt: now, attemptCount: 1, updatedAt: now }
          : {
              attemptCount: sql`${campusMapPlacePhotoUploadLimits.attemptCount} + 1`,
              updatedAt: now,
            },
      )
      .where(eq(campusMapPlacePhotoUploadLimits.actorUserId, actorId));
  });
}

async function readReadyCampusMapPlacePhoto(
  assetId: string,
  actorId: string,
  sourceSha256: string,
) {
  const [row] = await db
    .select()
    .from(campusMapPlacePhotoAssets)
    .where(
      and(
        eq(campusMapPlacePhotoAssets.id, assetId),
        eq(campusMapPlacePhotoAssets.ownerUserId, actorId),
        eq(campusMapPlacePhotoAssets.sourceSha256, sourceSha256),
        eq(campusMapPlacePhotoAssets.status, "ready"),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function waitForReadyCampusMapPlacePhoto(
  assetId: string,
  actorId: string,
  sourceSha256: string,
) {
  const deadline = Date.now() + CONCURRENT_UPLOAD_WAIT_MS;
  while (Date.now() < deadline) {
    const ready = await readReadyCampusMapPlacePhoto(
      assetId,
      actorId,
      sourceSha256,
    );
    if (ready) return ready;
    await new Promise((resolve) =>
      setTimeout(resolve, CONCURRENT_UPLOAD_POLL_MS),
    );
  }
  return readReadyCampusMapPlacePhoto(assetId, actorId, sourceSha256);
}

export async function cleanupCampusMapPlacePhotoAssets(
  input: {
    now?: Date;
    limit?: number;
    deleteStoredObjects?: (keys: string[]) => Promise<void>;
  } = {},
) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 12, 50));
  const claimed = await db.transaction(async (transaction) => {
    const rows = await transaction
      .select({
        id: campusMapPlacePhotoAssets.id,
        fullObjectKey: campusMapPlacePhotoAssets.fullObjectKey,
        thumbnailObjectKey: campusMapPlacePhotoAssets.thumbnailObjectKey,
      })
      .from(campusMapPlacePhotoAssets)
      .where(
        and(
          lte(campusMapPlacePhotoAssets.expiresAt, now),
          notExists(
            transaction
              .select({ assetId: campusMapRevisionPhotos.assetId })
              .from(campusMapRevisionPhotos)
              .where(
                eq(
                  campusMapRevisionPhotos.assetId,
                  campusMapPlacePhotoAssets.id,
                ),
              ),
          ),
        ),
      )
      .orderBy(
        campusMapPlacePhotoAssets.expiresAt,
        campusMapPlacePhotoAssets.id,
      )
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return rows;
    await transaction
      .update(campusMapPlacePhotoAssets)
      .set({
        status: "deleting",
        uploadToken: null,
        uploadLeaseExpiresAt: null,
        expiresAt: now,
        updatedAt: now,
      })
      .where(
        inArray(
          campusMapPlacePhotoAssets.id,
          rows.map((row) => row.id),
        ),
      );
    return rows;
  });
  if (claimed.length === 0) return { deleted: 0 };

  return deleteClaimedCampusMapPlacePhotoAssets(
    claimed,
    input.deleteStoredObjects ?? deletePrivateObjects,
  );
}
