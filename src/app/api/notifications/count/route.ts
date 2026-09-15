import { NextResponse } from "next/server";

import { getUnreadNotificationCount } from "@/lib/notification-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const count = await getUnreadNotificationCount();
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
