import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserForApi } from "@/lib/auth-guard";
import { parseModelExperimentParameters } from "@/lib/campus-transport/model-experiment";
import { runModelExperiment } from "@/lib/campus-transport/model-experiment-store";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUserForApi();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let parameters;
  try {
    parameters = parseModelExperimentParameters(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "INVALID_EXPERIMENT",
      },
      { status: 400 },
    );
  }

  try {
    const experiment = await runModelExperiment(user.id, parameters);
    return NextResponse.json(experiment, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "MODEL_EXPERIMENT_RATE_LIMIT_EXCEEDED"
    ) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED" },
        { status: 429 },
      );
    }
    throw error;
  }
}
