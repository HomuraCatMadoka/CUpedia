import { getObject } from "@/lib/minio";
import { NextResponse } from "next/server";

// Assets are public, like the wiki pages that embed them (#139). Keys are
// random UUIDs (immutable content), so cache aggressively: max-age for the
// browser, s-maxage for Vercel's edge cache.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: keySegments } = await params;
  const key = keySegments.join("/");

  if (!key.startsWith("wiki-assets/") || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  try {
    const response = await getObject(key);
    const stream = response.Body?.transformToWebStream();
    if (!stream) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(stream, {
      headers: {
        "Content-Type": response.ContentType ?? "application/octet-stream",
        "Cache-Control":
          "public, max-age=31536000, immutable, s-maxage=31536000",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
