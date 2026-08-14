import { getCourseReviews } from "@/lib/course-review-actions";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import { fail, ok } from "@/lib/cli-api/respond";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * GET /api/courses/:code/reviews?professor=&limit=&offset=
 *
 * Course reviews, newest first. getCourseReviews has no pagination
 * parameters, so filtering (by professor) and offset/limit slicing happen in
 * the route layer.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const search = new URL(request.url).searchParams;

  let limit = DEFAULT_LIMIT;
  const limitRaw = search.get("limit");
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return fail(ERROR_CODES.INVALID_PARAMS, 400);
    }
    limit = n;
  }

  let offset = 0;
  const offsetRaw = search.get("offset");
  if (offsetRaw !== null) {
    const n = Number(offsetRaw);
    if (!Number.isInteger(n) || n < 0) {
      return fail(ERROR_CODES.INVALID_PARAMS, 400);
    }
    offset = n;
  }

  const professor = search.get("professor")?.trim() || undefined;

  const all = await getCourseReviews(code);
  const filtered = professor
    ? all.filter(
        (review) =>
          review.professorId === professor ||
          review.professors?.some((p) => p.id === professor),
      )
    : all;

  return ok({
    reviews: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  });
}
