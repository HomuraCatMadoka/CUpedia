import { auth } from "@/lib/auth";
import { getObject } from "@/lib/minio";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
