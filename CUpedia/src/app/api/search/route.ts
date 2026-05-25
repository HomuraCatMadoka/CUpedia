import { NextRequest, NextResponse } from "next/server";
import { searchWikiPages } from "@/lib/wiki-actions";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchWikiPages(q);
  return NextResponse.json({ results });
}
