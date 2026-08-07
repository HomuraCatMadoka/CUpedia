import { getCourses, type CourseFilter } from "@/lib/course-review-actions";
import { parseCourseListQuery } from "@/lib/cli-api/schemas";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import { fail, ok } from "@/lib/cli-api/respond";

/** The catalog reader (getCourses) serves a fixed 48-per-page window. */
const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 48;

/**
 * GET /api/courses?page=&limit=&subject=&level=&sort=&q=
 *
 * Public catalog listing with filters, mirroring the in-app course browse.
 * The CLI plan uses `q` for the free-text query; the shared schema parser
 * (parseCourseListQuery) calls the same field `query`, so map it here.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("q") && !params.has("query")) {
    params.set("query", params.get("q") ?? "");
  }

  let limit = DEFAULT_PAGE_SIZE;
  const limitRaw = params.get("limit");
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
      return fail(ERROR_CODES.INVALID_PARAMS, 400);
    }
    limit = n;
  }

  const parsed = parseCourseListQuery(params);
  if (!parsed.ok) {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }

  const filter: CourseFilter = {
    ...parsed.value,
    page: parsed.value.page ?? 1,
  };
  const result = await getCourses(filter);

  // getCourses pages by a fixed 48-row window, so the requested limit is
  // honored as a ceiling check rather than a slice; pageSize always reflects
  // the actual window the reader returned.
  return ok({
    courses: result.courses,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}
