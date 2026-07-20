"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  clearCourseListNavigation,
  rememberCourseListNavigation,
} from "@/components/courses/course-list-navigation";

export function CourseListNavigationReset() {
  useEffect(() => clearCourseListNavigation(), []);
  return null;
}

export function CourseCardLink({
  href,
  returnTo,
  className,
  children,
}: {
  href: string;
  returnTo: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      data-testid="course-card"
      href={href}
      prefetch={false}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.currentTarget.target === "_blank"
        ) {
          return;
        }
        rememberCourseListNavigation(href, returnTo);
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
