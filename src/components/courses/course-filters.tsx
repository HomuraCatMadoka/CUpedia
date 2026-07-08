"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const CREDIT_OPTIONS = [
  { value: "3", label: "3 units" },
  { value: "2", label: "2 units" },
  { value: "1", label: "1 unit" },
  { value: "other", label: "4+ units" },
] as const;

export function CourseFilters({
  credits,
  departments,
  department,
}: {
  credits?: string;
  departments: string[];
  department?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle(key: "credits" | "department", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(key) === value) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-44">
      <div>
        <h2 className="mb-3 text-xs font-semibold text-muted-foreground uppercase">
          Department
        </h2>
        <div className="flex flex-wrap gap-2 lg:block lg:space-y-1.5">
          {departments.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggle("department", item)}
              className={cn(
                "rounded-lg px-2 py-1 text-left text-sm transition-colors lg:w-full",
                department === item
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-semibold text-muted-foreground uppercase">
          Units
        </h2>
        <div className="flex flex-wrap gap-2 lg:block lg:space-y-1.5">
          {CREDIT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle("credits", option.value)}
              className={cn(
                "rounded-lg px-2 py-1 text-left text-sm transition-colors lg:w-full",
                credits === option.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
