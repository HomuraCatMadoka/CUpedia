"use client";

import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function CourseSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const trimmed = value.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form onSubmit={submit} className="relative w-full">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground">
        <SearchIcon aria-hidden="true" className="h-5 w-5" />
      </span>
      <input
        type="search"
        aria-label="搜索课程"
        name="course-query"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索课程代码或名称…"
        className="min-h-11 w-full rounded-xl border bg-background py-3 pr-4 pl-11 text-base placeholder-muted-foreground transition-colors focus:border-foreground focus:outline-none"
      />
    </form>
  );
}
