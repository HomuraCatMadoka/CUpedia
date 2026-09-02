import { NextResponse } from "next/server";

import { getAuthenticatedUserForApi } from "@/lib/auth-guard";
import { getCampusMapPlacePhotoObject } from "@/lib/campus-map/place-photos";
import type { CampusMapPlacePhotoVariant } from "@/lib/campus-map/place-photos-contract";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string; variant: string }> },
) {
  const { photoId, variant } = await params;
  if (variant !== "full" && variant !== "thumbnail") {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  let object = await getCampusMapPlacePhotoObject({
    assetId: photoId.toLowerCase(),
    variant: variant as CampusMapPlacePhotoVariant,
    actorId: null,
  });
  if (!object) {
    const viewer = await getAuthenticatedUserForApi().catch(() => null);
    if (viewer) {
      object = await getCampusMapPlacePhotoObject({
        assetId: photoId.toLowerCase(),
        variant: variant as CampusMapPlacePhotoVariant,
        actorId: viewer.id,
      });
    }
  }
  if (!object) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  try {
    const response = await object.read(object.key);
    const stream = response.Body?.transformToWebStream();
    if (!stream) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
}
