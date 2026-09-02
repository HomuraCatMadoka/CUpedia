import { NextResponse } from "next/server";

import { cleanupCampusMapPlacePhotoAssets } from "@/lib/campus-map/place-photos";

const MAX_BATCHES_PER_RUN = 10;
const BATCH_SIZE = 50;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let deleted = 0;
  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const result = await cleanupCampusMapPlacePhotoAssets({
        limit: BATCH_SIZE,
      });
      deleted += result.deleted;
      if (result.deleted < BATCH_SIZE) break;
    }
    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: "CLEANUP_FAILED" }, { status: 500 });
  }
}
