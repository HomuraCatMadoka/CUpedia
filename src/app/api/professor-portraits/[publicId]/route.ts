import { NextResponse } from "next/server";

import {
  getProfessorDepartmentPortrait,
  isAllowedProfessorPortraitUrl,
} from "@/lib/professor-portrait-source";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  if (!UUID_PATTERN.test(publicId)) {
    return NextResponse.json(
      { error: "Invalid professor ID" },
      { status: 400 },
    );
  }

  const portrait = await getProfessorDepartmentPortrait(publicId);
  if (
    !portrait ||
    !isAllowedProfessorPortraitUrl(portrait.imageUrl) ||
    !isAllowedProfessorPortraitUrl(portrait.profileUrl)
  ) {
    return notFound();
  }

  try {
    const upstream = await fetch(portrait.imageUrl, {
      headers: {
        Referer: portrait.profileUrl,
        "User-Agent": "CUpedia professor portrait proxy",
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = upstream.headers.get("Content-Type")?.split(";", 1)[0];
    if (!upstream.ok || !contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      return notFound();
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return notFound();

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
