import { getCourse } from "@/lib/course-review-actions";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import { fail, ok } from "@/lib/cli-api/respond";

/**
 * GET /api/courses/:code — single course detail (code is space-insensitive,
 * normalized inside getCourse). 404 when the code is unknown.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const course = await getCourse(code);
  if (!course) {
    return fail(ERROR_CODES.NOT_FOUND, 404);
  }
  return ok({ course });
}
