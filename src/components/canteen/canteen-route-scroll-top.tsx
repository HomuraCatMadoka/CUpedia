"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/** Shared canteen layout keeps scroll; reset on every canteen route change. */
export function CanteenRouteScrollTop() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const toTop = () =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    toTop();
    const raf = requestAnimationFrame(toTop);
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
