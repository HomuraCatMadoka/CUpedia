import { NextResponse } from "next/server";
import {
  isMenuSourceSyncFailure,
  syncEnabledCanteenMenuSources,
} from "@/lib/canteen-menu-source-sync";
import { hasBearerSecret } from "@/lib/server-bearer-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  }
  if (!hasBearerSecret(request, secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const results = await syncEnabledCanteenMenuSources();
  const failed = results.filter(isMenuSourceSyncFailure).length;
  return NextResponse.json(
    { synced: results.length, failed, results },
    { status: failed > 0 ? 207 : 200 },
  );
}
