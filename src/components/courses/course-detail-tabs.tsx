import Link from "next/link";
import { cn } from "@/lib/utils";

export type CourseDetailTab = "reviews" | "enrollment";

export function CourseDetailTabs({
  activeTab,
  reviewCount,
  enrollmentCount,
  reviewsHref,
  enrollmentHref,
}: {
  activeTab: CourseDetailTab;
  reviewCount: number;
  enrollmentCount: number;
  reviewsHref: string;
  enrollmentHref: string;
}) {
  const tabs = [
    {
      id: "reviews" as const,
      label: "同学测评",
      count: reviewCount,
      href: reviewsHref,
    },
    {
      id: "enrollment" as const,
      label: "选课人数",
      count: enrollmentCount,
      href: enrollmentHref,
    },
  ];

  return (
    <nav
      aria-label="课程详情内容"
      className="sticky top-[100px] z-10 mt-6 bg-background/95 py-2 backdrop-blur-sm sm:top-14"
    >
      <div className="grid grid-cols-2 rounded-xl border border-foreground/15 bg-secondary/60 p-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              scroll={false}
              aria-label={`${tab.label} ${tab.count}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "bg-foreground text-background shadow-sm"
                  : "text-foreground/65 hover:bg-background/70 hover:text-foreground",
              )}
            >
              <span className="truncate">{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                  active
                    ? "bg-background/15 text-background"
                    : "bg-background text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
