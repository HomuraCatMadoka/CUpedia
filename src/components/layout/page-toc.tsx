"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import type { Heading } from "@/lib/headings";

export function PageToc({
  headings,
  pageTitle,
  parentTitle,
  parentSlug,
}: {
  headings: Heading[];
  pageTitle: string;
  parentTitle?: string;
  parentSlug?: string;
}) {
  const ids = headings.map((h) => h.id);
  const activeId = useScrollSpy(ids);

  const backHref = parentSlug ? `/wiki/${parentSlug}` : "/wiki";
  const backLabel = parentTitle ?? "CUpedia";

  return (
    <div className="flex flex-col gap-3 p-3">
      <Link
        href={backHref}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-3" />
        <span className="truncate">{backLabel}</span>
      </Link>

      <div className="truncate text-sm font-semibold">{pageTitle}</div>

      <div
        className="border-t pt-2"
        style={{ borderColor: "var(--sidebar-border-color)" }}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          On this page
        </span>
        <ul className="mt-2 space-y-1">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(h.id)
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className={cn(
                  "block truncate rounded px-2 py-0.5 text-xs hover:bg-[var(--sidebar-active-bg)]",
                  h.level === 3 && "pl-5",
                  activeId === h.id &&
                    "border-l-2 border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] font-medium",
                )}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
