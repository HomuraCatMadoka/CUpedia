import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { getAdminUserForApi } from "@/lib/auth-guard";
import { promoteModelExperiment } from "@/lib/campus-transport/model-experiment-store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ revisionId: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { revisionId } = await context.params;
  try {
    const champion = await promoteModelExperiment(revisionId);
    revalidateTag("campus-bus-model", { expire: 0 });
    return NextResponse.json(champion);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROMOTION_FAILED";
    if (code === "MODEL_EXPERIMENT_NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (
      code === "MODEL_EXPERIMENT_NOT_PROMOTABLE" ||
      code === "MODEL_EXPERIMENT_STALE" ||
      code === "MODEL_EXPERIMENT_NOT_BETTER_THAN_CHAMPION"
    ) {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    throw error;
  }
}
