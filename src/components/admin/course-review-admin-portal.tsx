import type { CourseReviewAdminStats } from "@/lib/course-review-actions";

export function CourseReviewAdminPortal({
  stats,
}: {
  stats: CourseReviewAdminStats;
}) {
  const cards = [
    {
      label: `近 ${stats.recentWindowDays} 日新增评价`,
      value: stats.recentReviewCount,
      hint: "course_reviews 新增条数",
    },
    {
      label: "评价总数",
      value: stats.totalReviewCount,
      hint: "全部课程文字评价",
    },
    {
      label: "科目总数",
      value: stats.totalSubjectCount,
      hint: "课程目录中的 subject",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">课程评价概览</h1>
        <p className="text-sm text-muted-foreground">
          查看近期课程评价增长，以及目录内科目与评价总量。
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-black/10 px-4 py-4"
          >
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {card.label}
            </dt>
            <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {card.value.toLocaleString("zh-HK")}
            </dd>
            <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
          </div>
        ))}
      </dl>
    </div>
  );
}
