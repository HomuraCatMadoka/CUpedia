import { NextResponse } from "next/server";

import {
  submitCourseReview,
  type CourseReviewSubmission,
} from "@/lib/course-review-actions";
import { COURSE_TERMS } from "@/lib/course-review-constants";
import { requireCliAuth } from "@/lib/cli-api/auth";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import {
  DEFAULT_WRITE_LIMIT,
  checkRateLimit,
} from "@/lib/cli-api/rate-limit";
import { fail, ok, parseJsonBody } from "@/lib/cli-api/respond";

const ACADEMIC_YEAR_PATTERN = /^(\d{4})-(\d{2})$/;
/** submitCourseReview's own content ceiling. */
const MAX_CONTENT_LENGTH = 2000;
const MAX_PROFESSOR_IDS = 20;

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

/**
 * POST /api/courses/:code/review  (auth required)
 *
 * Body: { score, content?, academicYear, term, professorIds?, isAnonymous? }
 *
 * The shared business action (submitCourseReview) guards itself with the
 * browser-session `requireAuth()` (next/navigation redirect — wrong for API
 * routes), so this route resolves the caller via requireCliAuth and passes
 * the authenticated user in explicitly.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;

  const auth = await requireCliAuth(request);
  if (auth.response) return auth.response;

  // Per-user write budget: a logged-in caller's bearer identity is the rate
  // limit key (CLI callers have no stable IP under Vercel).
  const rl = checkRateLimit(`courses:review:${auth.user.id}`, DEFAULT_WRITE_LIMIT);
  if (!rl.allowed) {
    return fail(ERROR_CODES.RATE_LIMIT_EXCEEDED, 429);
  }

  const body = await parseJsonBody(request);
  if (!isPlainObject(body)) {
    return fail(ERROR_CODES.INVALID_JSON, 400);
  }

  // ── hand validation (no zod in the project) ──
  const score = body.score;
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0.5 ||
    score > 5 ||
    !Number.isInteger(score * 2)
  ) {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }

  const content = body.content;
  if (
    content !== undefined &&
    (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH)
  ) {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }

  const academicYear = body.academicYear;
  if (typeof academicYear !== "string") {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }
  const yearMatch = ACADEMIC_YEAR_PATTERN.exec(academicYear);
  if (
    !yearMatch ||
    (Number(yearMatch[1]) + 1) % 100 !== Number(yearMatch[2])
  ) {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }

  const term = body.term;
  if (
    typeof term !== "string" ||
    !(COURSE_TERMS as readonly string[]).includes(term)
  ) {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }

  const isAnonymous = body.isAnonymous;
  if (isAnonymous !== undefined && typeof isAnonymous !== "boolean") {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }

  let professorIds: string[] | undefined;
  if (body.professorIds !== undefined) {
    if (
      !Array.isArray(body.professorIds) ||
      body.professorIds.length > MAX_PROFESSOR_IDS ||
      body.professorIds.some(
        (id) => typeof id !== "string" || !id.trim(),
      )
    ) {
      return fail(ERROR_CODES.INVALID_PARAMS, 400);
    }
    professorIds = body.professorIds as string[];
  }

  const submission: CourseReviewSubmission = {
    score,
    academicYear,
    term: term as CourseReviewSubmission["term"],
    ...(content !== undefined ? { content } : {}),
    ...(professorIds !== undefined ? { professorIds } : {}),
    ...(isAnonymous !== undefined ? { isAnonymous } : {}),
  };

  try {
    const result = await submitCourseReview(code, submission, {
      id: auth.user.id,
      nickname: auth.user.nickname,
    });
    return ok({ newAchievementNotices: result.newAchievementNotices }, 201);
  } catch (err) {
    const error = err as Error & { code?: string };
    // AccountSetupRequiredError carries this stable code; duck-typed to avoid
    // importing the class (keeps the route trivially mockable in tests).
    if (error.code === "ACCOUNT_SETUP_REQUIRED") {
      return fail(ERROR_CODES.ACCOUNT_SETUP_REQUIRED, 403);
    }
    if (error.message === "课程不存在") {
      return fail(ERROR_CODES.NOT_FOUND, 404);
    }
    return NextResponse.json(
      { error: ERROR_CODES.INVALID_PARAMS, message: error.message },
      { status: 400 },
    );
  }
}
