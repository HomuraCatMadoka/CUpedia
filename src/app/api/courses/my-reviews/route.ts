import { getMyCourseReviewHistory } from "@/lib/course-review-actions";
import { requireCliAuth } from "@/lib/cli-api/auth";
import { ok } from "@/lib/cli-api/respond";

/**
 * GET /api/courses/my-reviews  (auth required)
 *
 * The caller's own course ratings/reviews, newest first. The business action
 * guards itself with the browser-session `requireAuth()` (redirect), so the
 * authenticated CLI user is passed in explicitly.
 */
export async function GET(request: Request) {
  const auth = await requireCliAuth(request);
  if (auth.response) return auth.response;

  const reviews = await getMyCourseReviewHistory({ id: auth.user.id });
  return ok({ reviews });
}
