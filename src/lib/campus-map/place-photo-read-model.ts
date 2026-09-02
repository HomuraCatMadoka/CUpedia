import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  campusMapCurrentRevisions,
  campusMapPlacePhotoAssets,
  campusMapRevisionPhotos,
  campusMapRevisionVisibility,
} from "@/db/schema";
import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  toCampusMapPlacePhotoView,
  type CampusMapPlacePhotoVariant,
  type CampusMapPlacePhotoView,
} from "@/lib/campus-map/place-photos-contract";
import { getPrivateObject } from "@/lib/minio";

export async function getCampusMapPlacePhotoObject(input: {
  assetId: string;
  variant: CampusMapPlacePhotoVariant;
  actorId: string | null;
}) {
  if (!isCanonicalCampusMapUuid(input.assetId)) return null;
  const [asset] = await db
    .select({
      ownerUserId: campusMapPlacePhotoAssets.ownerUserId,
      status: campusMapPlacePhotoAssets.status,
      fullObjectKey: campusMapPlacePhotoAssets.fullObjectKey,
      thumbnailObjectKey: campusMapPlacePhotoAssets.thumbnailObjectKey,
    })
    .from(campusMapPlacePhotoAssets)
    .where(eq(campusMapPlacePhotoAssets.id, input.assetId))
    .limit(1);
  if (!asset || asset.status !== "ready") return null;
  const isOwner = input.actorId !== null && asset.ownerUserId === input.actorId;
  const [publicBinding] = await db
    .select({ assetId: campusMapRevisionPhotos.assetId })
    .from(campusMapRevisionPhotos)
    .innerJoin(
      campusMapCurrentRevisions,
      and(
        eq(
          campusMapCurrentRevisions.revisionId,
          campusMapRevisionPhotos.revisionId,
        ),
        eq(campusMapCurrentRevisions.status, "active"),
      ),
    )
    .innerJoin(
      campusMapRevisionVisibility,
      and(
        eq(
          campusMapRevisionVisibility.revisionId,
          campusMapRevisionPhotos.revisionId,
        ),
        eq(campusMapRevisionVisibility.visibility, "public"),
      ),
    )
    .where(eq(campusMapRevisionPhotos.assetId, input.assetId))
    .limit(1);
  if (!publicBinding) {
    if (!isOwner) return null;
    const [binding] = await db
      .select({ assetId: campusMapRevisionPhotos.assetId })
      .from(campusMapRevisionPhotos)
      .where(eq(campusMapRevisionPhotos.assetId, input.assetId))
      .limit(1);
    if (binding) return null;
  }
  return {
    key:
      input.variant === "full" ? asset.fullObjectKey : asset.thumbnailObjectKey,
    read: getPrivateObject,
  };
}

export async function getCampusMapRevisionPhotoViews(
  revisionIds: readonly string[],
) {
  const ids = [...new Set(revisionIds.filter(isCanonicalCampusMapUuid))];
  if (ids.length === 0) {
    return {} as Record<string, CampusMapPlacePhotoView[]>;
  }
  const rows = await db
    .select({
      revisionId: campusMapRevisionPhotos.revisionId,
      id: campusMapPlacePhotoAssets.id,
      role: campusMapRevisionPhotos.role,
      sortOrder: campusMapRevisionPhotos.sortOrder,
      fullWidth: campusMapPlacePhotoAssets.fullWidth,
      fullHeight: campusMapPlacePhotoAssets.fullHeight,
      thumbnailWidth: campusMapPlacePhotoAssets.thumbnailWidth,
      thumbnailHeight: campusMapPlacePhotoAssets.thumbnailHeight,
    })
    .from(campusMapRevisionPhotos)
    .innerJoin(
      campusMapPlacePhotoAssets,
      and(
        eq(campusMapPlacePhotoAssets.id, campusMapRevisionPhotos.assetId),
        eq(campusMapPlacePhotoAssets.status, "ready"),
      ),
    )
    .where(inArray(campusMapRevisionPhotos.revisionId, ids))
    .orderBy(
      campusMapRevisionPhotos.revisionId,
      campusMapRevisionPhotos.sortOrder,
    );
  const grouped: Record<string, CampusMapPlacePhotoView[]> = {};
  for (const row of rows) {
    (grouped[row.revisionId] ??= []).push({
      ...toCampusMapPlacePhotoView(row),
      role: row.role,
      sortOrder: row.sortOrder,
    });
  }
  return grouped;
}

export async function getCampusMapCurrentPlaceCoverViews(
  placeIds: readonly string[],
) {
  const ids = [...new Set(placeIds.filter(isCanonicalCampusMapUuid))];
  if (ids.length === 0) {
    return {} as Record<string, CampusMapPlacePhotoView>;
  }
  const rows = await db
    .select({
      placeId: campusMapCurrentRevisions.placeId,
      id: campusMapPlacePhotoAssets.id,
      role: campusMapRevisionPhotos.role,
      sortOrder: campusMapRevisionPhotos.sortOrder,
      fullWidth: campusMapPlacePhotoAssets.fullWidth,
      fullHeight: campusMapPlacePhotoAssets.fullHeight,
      thumbnailWidth: campusMapPlacePhotoAssets.thumbnailWidth,
      thumbnailHeight: campusMapPlacePhotoAssets.thumbnailHeight,
    })
    .from(campusMapCurrentRevisions)
    .innerJoin(
      campusMapRevisionVisibility,
      and(
        eq(
          campusMapRevisionVisibility.revisionId,
          campusMapCurrentRevisions.revisionId,
        ),
        eq(campusMapRevisionVisibility.visibility, "public"),
      ),
    )
    .innerJoin(
      campusMapRevisionPhotos,
      eq(
        campusMapRevisionPhotos.revisionId,
        campusMapCurrentRevisions.revisionId,
      ),
    )
    .innerJoin(
      campusMapPlacePhotoAssets,
      and(
        eq(campusMapPlacePhotoAssets.id, campusMapRevisionPhotos.assetId),
        eq(campusMapPlacePhotoAssets.status, "ready"),
      ),
    )
    .where(
      and(
        inArray(campusMapCurrentRevisions.placeId, ids),
        eq(campusMapCurrentRevisions.status, "active"),
        eq(campusMapRevisionPhotos.sortOrder, 0),
      ),
    )
    .orderBy(
      campusMapCurrentRevisions.placeId,
      campusMapRevisionPhotos.sortOrder,
    );
  const covers: Record<string, CampusMapPlacePhotoView> = {};
  for (const row of rows) {
    covers[row.placeId] = {
      ...toCampusMapPlacePhotoView(row),
      role: row.role,
      sortOrder: row.sortOrder,
    };
  }
  return covers;
}
