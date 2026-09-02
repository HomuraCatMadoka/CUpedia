import { CAMPUS_MAP_PLACE_PHOTO_ROLES } from "@/lib/campus-map/controlled-values";

export { CAMPUS_MAP_PLACE_PHOTO_ROLES };

export const CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT = 3;
export const CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const CAMPUS_MAP_PLACE_PHOTO_UPLOAD_ERROR_CODES = [
  "photo-empty",
  "photo-too-large",
  "photo-type-unsupported",
  "photo-dimensions-too-large",
  "photo-processing-failed",
  "photo-upload-rate-limited",
  "photo-upload-failed",
  "photo-invalid-id",
] as const;

export type CampusMapPlacePhotoRole =
  (typeof CAMPUS_MAP_PLACE_PHOTO_ROLES)[number];
export type CampusMapPlacePhotoUploadErrorCode =
  (typeof CAMPUS_MAP_PLACE_PHOTO_UPLOAD_ERROR_CODES)[number];
export type CampusMapPlacePhotoVariant = "full" | "thumbnail";

export interface CampusMapPlacePhotoAssetView {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
}

export interface CampusMapPlacePhotoView extends CampusMapPlacePhotoAssetView {
  role: CampusMapPlacePhotoRole;
  sortOrder: number;
}

export function toCampusMapPlacePhotoView(row: {
  id: string;
  fullWidth: number;
  fullHeight: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
}): CampusMapPlacePhotoAssetView {
  return {
    id: row.id,
    url: campusMapPlacePhotoUrl(row.id, "full"),
    thumbnailUrl: campusMapPlacePhotoUrl(row.id, "thumbnail"),
    width: row.fullWidth,
    height: row.fullHeight,
    thumbnailWidth: row.thumbnailWidth,
    thumbnailHeight: row.thumbnailHeight,
  };
}

export function campusMapPlacePhotoUrl(
  id: string,
  variant: CampusMapPlacePhotoVariant,
) {
  return `/api/campus-map/place-photos/${id}/${variant}`;
}
