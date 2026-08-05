import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

function isAuthorized(request: Request, secret: string) {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(value.slice(7));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export async function POST(request: Request) {
  const secret = process.env.WIKI_REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  revalidateTag("wiki-pages", { expire: 0 });
  revalidateTag("wiki-search-corpus", { expire: 0 });
  return NextResponse.json({ revalidated: true });
}
