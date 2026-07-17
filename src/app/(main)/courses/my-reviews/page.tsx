import { MyCourseReviewHistory } from "@/components/courses/my-course-review-history";
import { getMyCourseReviewHistory } from "@/lib/course-review-actions";

export default async function MyCourseReviewsPage() {
  const items = await getMyCourseReviewHistory();
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">我的课程评价</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          查看并管理你提交过的评分与评论。
        </p>
        <div className="mt-8">
          <MyCourseReviewHistory items={items} />
        </div>
      </div>
    </div>
  );
}
