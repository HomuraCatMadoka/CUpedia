"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";

// Sidebar links ship with prefetch disabled to keep idle navigation traffic off
// (518 links would otherwise prefetch on view). Hovering signals intent, so we
// prefetch then — the ~200-400ms aim time covers a round trip, making the click
// feel instant (#137). Each instance fires once; Next dedups globally too.
export function PrefetchLink({
  href,
  onMouseEnter,
  ...props
}: ComponentProps<typeof Link>) {
  const router = useRouter();
  const prefetched = useRef(false);

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        if (!prefetched.current && typeof href === "string") {
          prefetched.current = true;
          router.prefetch(href);
        }
        onMouseEnter?.(e);
      }}
      {...props}
    />
  );
}
