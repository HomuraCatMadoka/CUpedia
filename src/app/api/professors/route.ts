import { searchProfessors } from "@/lib/course-review-actions";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import { fail, ok } from "@/lib/cli-api/respond";

/**
 * GET /api/professors?course=CODE&q=
 *
 * Professor options for a course's review form. `course` is required;
 * an empty `q` returns an empty list (matches searchProfessors).
 */
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const course = search.get("course")?.trim();
  if (!course) {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }
  const q = search.get("q")?.trim() ?? "";
  const professors = await searchProfessors(course, q);
  return ok({ professors });
}
