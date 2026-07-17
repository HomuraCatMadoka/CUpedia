"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { consumeCourseListNavigation } from "@/components/courses/course-list-navigation";

export function CourseListBackLink({
  href,
  restoreHistory,
  label = "返回课程列表",
}: {
  href: string;
  restoreHistory: boolean;
  label?: string;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (
          !restoreHistory ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.currentTarget.target === "_blank"
        ) {
          return;
        }

        const detailHref = `${window.location.pathname}${window.location.search}`;
        if (!consumeCourseListNavigation(detailHref, href)) return;
        event.preventDefault();
        router.back();
      }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeftIcon className="h-4 w-4" />
      {label}
    </Link>
  );
}
