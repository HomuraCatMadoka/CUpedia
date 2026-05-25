"use client";

import Link from "next/link";
import { useSidebar } from "@/components/layout/sidebar-provider";

export function SidebarToggle({ canEdit = false }: { canEdit?: boolean } = {}) {
  const { state, isMobile, toggle, openMobile } = useSidebar();

  if (state === "expanded" || state === "mobile-open") return null;

  return (
    <div
      className="flex h-full w-[var(--sidebar-collapsed-width)] shrink-0 flex-col items-center gap-2 border-r bg-[var(--sidebar-bg)] pt-3"
      style={{ borderColor: "var(--sidebar-border-color)" }}
    >
      <button
        onClick={isMobile ? openMobile : toggle}
        className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-[var(--sidebar-active-bg)]"
        aria-label="展开导航"
      >
        ☰
      </button>
      <Link
        href="/wiki/search"
        className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-[var(--sidebar-active-bg)]"
        aria-label="搜索"
      >
        🔍
      </Link>
      {canEdit && (
        <Link
          href="/wiki/new"
          className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-[var(--sidebar-active-bg)]"
          aria-label="新建页面"
        >
          +
        </Link>
      )}
    </div>
  );
}
