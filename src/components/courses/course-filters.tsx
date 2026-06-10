"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FACULTY_ORDER,
  FACULTY_LABELS,
  type Faculty,
} from "@/app/(main)/courses/mock/courses";

const CREDIT_OPTIONS: { value: string; label: string }[] = [
  { value: "3", label: "3 学分" },
  { value: "2", label: "2 学分" },
  { value: "1", label: "1 学分" },
  { value: "other", label: "4 学分以上" },
];

export function CourseFilters({
  faculty,
  credits,
}: {
  faculty?: string;
  credits?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Toggle a filter param: setting it when off, clearing it when already active.
  function toggle(key: "faculty" | "credits", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(key) === value) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <aside className="w-full shrink-0 space-y-8 lg:w-48">
      <div>
        <h3 className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          学院
        </h3>
        <ul className="space-y-2 text-sm">
          {FACULTY_ORDER.map((f: Faculty) => (
            <li key={f}>
              <button
                type="button"
                onClick={() => toggle("faculty", f)}
                className={cn(
                  "text-left transition-colors hover:text-foreground",
                  faculty === f
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {FACULTY_LABELS[f]}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          学分
        </h3>
        <ul className="space-y-2 text-sm">
          {CREDIT_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => toggle("credits", opt.value)}
                className={cn(
                  "text-left transition-colors hover:text-foreground",
                  credits === opt.value
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
