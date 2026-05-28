"use client";

import type { PlateElementProps } from "platejs/react";

import { useTocElement, useTocElementState } from "@platejs/toc/react";
import { ListTreeIcon } from "lucide-react";
import { PlateElement } from "platejs/react";

import { cn } from "@/lib/utils";
import { headingSlug } from "@/lib/headings";

export function TocElement(props: PlateElementProps) {
  const state = useTocElementState();
  const { props: tocProps } = useTocElement(state);

  const headings = state.headingList.filter(
    (h) => h.depth >= 2 && h.depth <= 3,
  );

  return (
    <PlateElement {...props}>
      <div className="my-4 rounded-lg border bg-muted/40 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <ListTreeIcon className="size-4" />
          目录
        </div>

        {headings.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">
            添加标题 (h2/h3) 后目录会自动生成
          </p>
        ) : (
          <ul className="space-y-0.5">
            {headings.map((heading) => (
              <li key={heading.path.join("-")}>
                <a
                  href={`#${headingSlug(heading.title)}`}
                  className={cn(
                    "block rounded px-2 py-0.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground",
                    heading.depth === 3 && "pl-6",
                  )}
                  onClick={(e) => tocProps.onClick(e, heading, "smooth")}
                >
                  {heading.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {props.children}
    </PlateElement>
  );
}
