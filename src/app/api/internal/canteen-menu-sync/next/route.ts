import { NextResponse } from "next/server";
import { syncNextDueMenuSource } from "@/lib/canteen-menu-source-sync";
import { hasBearerSecret } from "@/lib/server-bearer-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  }
  const secret = process.env.MENU_SYNC_TRIGGER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  }
  if (!hasBearerSecret(request, secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return NextResponse.json(await syncNextDueMenuSource());
}
