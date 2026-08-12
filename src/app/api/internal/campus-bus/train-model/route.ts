import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { rebuildCampusBusPredictionModel } from "@/lib/campus-transport/prediction-model-store";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await rebuildCampusBusPredictionModel();
  if (result.promoted) revalidateTag("campus-bus-model", { expire: 0 });
  return NextResponse.json(result);
}
