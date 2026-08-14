import type { NextRequest } from "next/server";

import { fail, ok, parseJsonBody } from "@/lib/cli-api/respond";
import { parseCollegePickBody } from "@/lib/cli-api/schemas";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import { recommend } from "@/lib/college-picker/recommend";

/**
 * POST /api/college-picker/recommend
 *
 * Validates a College Picker request body (majorGroup, priorities tuple,
 * avoids, optional smallCollegePreference / bonusFactors / smallCollegeAnswers)
 * and returns the pure-function ranking:
 *
 *   { rankings: ScoredCollege[] }
 */
export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (body === null) {
    return fail(ERROR_CODES.INVALID_JSON, 400);
  }

  const parsed = parseCollegePickBody(body);
  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  return ok({ rankings: recommend(parsed.value) });
}
