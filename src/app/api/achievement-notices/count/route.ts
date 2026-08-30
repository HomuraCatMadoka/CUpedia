import { NextResponse } from "next/server";

import { getAchievementNoticeCount } from "@/lib/achievement-notice-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const count = await getAchievementNoticeCount();
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
