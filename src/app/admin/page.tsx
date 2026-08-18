import { CourseReviewAdminPortal } from "@/components/admin/course-review-admin-portal";
import { getCourseReviewAdminStats } from "@/lib/course-review-actions";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const stats = await getCourseReviewAdminStats();
  return <CourseReviewAdminPortal stats={stats} />;
}
