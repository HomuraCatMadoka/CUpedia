"use client";

import { useSearchParams } from "next/navigation";

export function CampusBusRetiredRouteNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("routeRetired") !== "1b") return null;

  return (
    <div
      className="mx-auto mb-3 max-w-5xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:rounded-xl dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100"
      role="status"
    >
      1B 線已於 2026 年 9 月 1 日退役。請刷新路線目錄後重新選擇；新的 2S 線不是
      1B 線。
    </div>
  );
}
