import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isMenuSourceSyncFailure,
  syncEnabledCanteenMenuSources,
} from "@/lib/canteen-menu-source-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request, secret: string): boolean {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(value.slice(7));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const results = await syncEnabledCanteenMenuSources();
  const failed = results.filter(isMenuSourceSyncFailure).length;
  return NextResponse.json(
    { synced: results.length, failed, results },
    { status: failed > 0 ? 207 : 200 },
  );
}
