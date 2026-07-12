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
    const trimmed = value.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form onSubmit={submit} className="relative w-full">
      <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground">
        <SearchIcon className="h-5 w-5" />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索课程代码或名称..."
        className="w-full rounded-xl border bg-background py-3 pr-4 pl-11 text-sm placeholder-muted-foreground transition-colors focus:border-foreground focus:outline-none"
      />
    </form>
  );
}
