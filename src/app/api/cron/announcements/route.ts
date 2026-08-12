import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { broadcastDueAnnouncements } from "@/lib/announcement-broadcast";

function isAuthorized(request: Request, secret: string) {
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

  const processed = await broadcastDueAnnouncements();
  return NextResponse.json({ processed });
}
