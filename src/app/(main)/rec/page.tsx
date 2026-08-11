export const dynamic = "force-dynamic";

import type { Metadata } from "next";

import { CourseRecommendForm } from "@/components/courses/course-recommend-form";
import { getOptionalUser } from "@/lib/auth-guard";
import { listRecommendedCourses } from "@/lib/course-review-actions";

export const metadata: Metadata = {
  title: "课程推荐",
  description: "搜索已收录课程并提交课程测评。",
};

function recentAcademicYears(now = new Date()): string[] {
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 5 }, (_, index) => {
    const year = start - index;
    return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  });
}

export default async function CourseRecommendPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const [user, recommends] = await Promise.all([
    getOptionalUser(),
    listRecommendedCourses(),
  ]);
  const initialCode = code?.trim() || undefined;

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="border-b pb-5">
          <p className="text-sm text-muted-foreground">课程测评</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-balance">
            课程推荐
          </h1>
        </div>

        <div className="mt-8">
          <CourseRecommendForm
            academicYears={recentAcademicYears()}
            isAuthenticated={!!user}
            initialCode={initialCode}
            initialRecommends={recommends}
          />
        </div>
      </div>
    </div>
  );
}
