"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
      <Button
        variant="ghost"
        size="icon"
        onClick={isMobile ? openMobile : toggle}
        className="h-7 w-7 text-muted-foreground"
        aria-label="展开导航"
      >
        ☰
      </Button>
      {/* New-page entry is redundant on mobile (the drawer already exposes it),
          so it is hidden there; only the expand toggle remains as the rail. */}
      {canEdit && (
        <Button
          render={<Link href="/wiki/new" aria-label="新建页面" />}
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground max-md:hidden"
        >
          +
        </Button>
      )}
    </div>
  );
}
