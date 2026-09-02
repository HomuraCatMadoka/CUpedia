import { NextResponse } from "next/server";

import { getAuthenticatedUserForApi } from "@/lib/auth-guard";
import {
  CampusMapPlacePhotoError,
  uploadCampusMapPlacePhoto,
} from "@/lib/campus-map/place-photos";
import { CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES } from "@/lib/campus-map/place-photos-contract";

const MAX_MULTIPART_BYTES = CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES + 512 * 1024;

async function readBoundedMultipart(request: Request) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new Error("invalid-content-type");
  }
  if (!request.body) throw new Error("missing-body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MULTIPART_BYTES) {
      await reader.cancel();
      throw new CampusMapPlacePhotoError("photo-too-large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, {
    headers: { "Content-Type": contentType },
  }).formData();
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "invalid-origin" }, { status: 403 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0) {
    return NextResponse.json({ error: "invalid-form" }, { status: 400 });
  }
  if (declaredLength > MAX_MULTIPART_BYTES) {
    return NextResponse.json(
      { status: "validation-failed", code: "photo-too-large" },
      { status: 413 },
    );
  }

  const viewer = await getAuthenticatedUserForApi();
  if (!viewer) {
    return NextResponse.json(
      { status: "authentication-required" },
      { status: 401 },
    );
  }

  try {
    const form = await readBoundedMultipart(request);
    const assetId = form.get("assetId");
    const photo = form.get("photo");
    if (typeof assetId !== "string" || !(photo instanceof File)) {
      return NextResponse.json({ error: "invalid-form" }, { status: 400 });
    }
    const asset = await uploadCampusMapPlacePhoto({
      actorId: viewer.id,
      assetId,
      source: Buffer.from(await photo.arrayBuffer()),
    });
    return NextResponse.json({ status: "uploaded", asset });
  } catch (error) {
    if (error instanceof CampusMapPlacePhotoError) {
      return NextResponse.json(
        { status: "validation-failed", code: error.code },
        { status: error.code === "photo-too-large" ? 413 : 400 },
      );
    }
    return NextResponse.json({ error: "upload-failed" }, { status: 500 });
  }
}
