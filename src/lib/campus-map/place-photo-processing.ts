import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import {
  CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES,
  type CampusMapPlacePhotoUploadErrorCode,
} from "@/lib/campus-map/place-photos-contract";

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_INPUT_EDGE = 12_000;
const FULL_MAX_EDGE = 1_600;
const THUMBNAIL_MAX_WIDTH = 480;
const THUMBNAIL_MAX_HEIGHT = 320;

export class CampusMapPlacePhotoError extends Error {
  constructor(readonly code: CampusMapPlacePhotoUploadErrorCode) {
    super(code);
    this.name = "CampusMapPlacePhotoError";
  }
}

export interface ProcessedCampusMapPlacePhoto {
  sourceSha256: string;
  full: { body: Buffer; width: number; height: number };
  thumbnail: { body: Buffer; width: number; height: number };
}

export async function processCampusMapPlacePhoto(
  source: Buffer,
): Promise<ProcessedCampusMapPlacePhoto> {
  if (source.byteLength === 0) {
    throw new CampusMapPlacePhotoError("photo-empty");
  }
  if (source.byteLength > CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES) {
    throw new CampusMapPlacePhotoError("photo-too-large");
  }

  const detected = await fileTypeFromBuffer(source);
  if (
    !detected ||
    !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)
  ) {
    throw new CampusMapPlacePhotoError("photo-type-unsupported");
  }

  try {
    const sourceImage = sharp(source, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    });
    const metadata = await sourceImage.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_INPUT_EDGE ||
      metadata.height > MAX_INPUT_EDGE ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new CampusMapPlacePhotoError("photo-dimensions-too-large");
    }

    const normalized = sourceImage.rotate();
    const [fullResult, thumbnailResult] = await Promise.all([
      normalized
        .clone()
        .resize({
          width: FULL_MAX_EDGE,
          height: FULL_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true }),
      normalized
        .clone()
        .resize({
          width: THUMBNAIL_MAX_WIDTH,
          height: THUMBNAIL_MAX_HEIGHT,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 76, effort: 4 })
        .toBuffer({ resolveWithObject: true }),
    ]);
    if (
      !fullResult.info.width ||
      !fullResult.info.height ||
      !thumbnailResult.info.width ||
      !thumbnailResult.info.height ||
      fullResult.data.byteLength > CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES ||
      thumbnailResult.data.byteLength > CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES
    ) {
      throw new CampusMapPlacePhotoError("photo-processing-failed");
    }
    return {
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      full: {
        body: fullResult.data,
        width: fullResult.info.width,
        height: fullResult.info.height,
      },
      thumbnail: {
        body: thumbnailResult.data,
        width: thumbnailResult.info.width,
        height: thumbnailResult.info.height,
      },
    };
  } catch (error) {
    if (error instanceof CampusMapPlacePhotoError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/pixel limit|Input image exceeds pixel limit/i.test(message)) {
      throw new CampusMapPlacePhotoError("photo-dimensions-too-large");
    }
    throw new CampusMapPlacePhotoError("photo-processing-failed");
  }
}
