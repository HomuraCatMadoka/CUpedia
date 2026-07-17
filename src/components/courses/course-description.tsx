"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Course description with expand/collapse on mobile.
 *
 * On screens below `md` the text is clamped to 4 lines. A toggle button
 * appears only when the clamped text actually overflows (measured via
 * ResizeObserver, which fires after layout and on window resize).
 * On `md+` the full description is always visible.
 */
export function CourseDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // While expanded the text is unclamped and can never overflow; keep the
    // last measured value so the toggle doesn't vanish for a frame on collapse.
    if (expanded) return;

    const el = ref.current;
    if (!el) return;

    const check = () => {
      setOverflow(el.scrollHeight > el.clientHeight);
    };

    const observer = new ResizeObserver(check);
    observer.observe(el);
    check();

    return () => observer.disconnect();
  }, [text, expanded]);

  if (!text) return null;

  return (
    <div className="mt-5 border-t pt-5">
      <div className="md:hidden">
        <p
          ref={ref}
          className={cn(
            "text-sm leading-relaxed text-muted-foreground",
            !expanded && "line-clamp-4",
          )}
        >
          {text}
        </p>
        {(overflow || expanded) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 -ml-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {expanded ? "收起" : "展开"}
            <ChevronDownIcon
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      <p className="hidden md:block text-sm leading-relaxed text-muted-foreground">
        {text}
      </p>
    </div>
  );
}
