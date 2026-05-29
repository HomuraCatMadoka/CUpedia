"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/sidebar-provider";

export function SidebarToggle({ canEdit = false }: { canEdit?: boolean } = {}) {
  const { state, isMobile, toggle, openMobile } = useSidebar();

  // Overlay state hides the rail entirely. The expanded state still renders the
  // rail but only at the mobile breakpoint (`md:hidden`), so the first paint on
  // small screens is the collapsed rail via CSS — no expand→collapse flash.
  if (state === "mobile-open") return null;

  return (
    <div
      className={cn(
        "flex h-full w-[var(--sidebar-collapsed-width)] shrink-0 flex-col items-center gap-2 border-r bg-[var(--sidebar-bg)] pt-3",
        state === "expanded" && "md:hidden",
      )}
      style={{ borderColor: "var(--sidebar-border-color)" }}
    >
      <button
        onClick={isMobile ? openMobile : toggle}
        className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-[var(--sidebar-active-bg)]"
        aria-label="展开导航"
      >
        ☰
      </button>
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
