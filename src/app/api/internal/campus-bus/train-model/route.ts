import { NextRequest, NextResponse } from "next/server";

import { rebuildCampusBusPredictionModel } from "@/lib/campus-transport/prediction-model-store";
import { campusBusModelOperationsEnabled } from "@/lib/campus-transport/model-operations";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!campusBusModelOperationsEnabled()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await rebuildCampusBusPredictionModel();
  return NextResponse.json(result);
}
