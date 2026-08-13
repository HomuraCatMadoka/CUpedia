import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { getAdminUserForApi } from "@/lib/auth-guard";
import { rollbackCampusBusModel } from "@/lib/campus-transport/model-experiment-store";
import { campusBusModelOperationsEnabled } from "@/lib/campus-transport/model-operations";

export async function POST(
  _request: Request,
  context: { params: Promise<{ revisionId: string }> },
) {
  if (!campusBusModelOperationsEnabled()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { revisionId } = await context.params;
  try {
    const champion = await rollbackCampusBusModel(revisionId);
    revalidateTag("campus-bus-model", { expire: 0 });
    return NextResponse.json(champion);
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "MODEL_ROLLBACK_FAILED";
    if (code === "MODEL_ROLLBACK_TARGET_NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    throw error;
  }
}
