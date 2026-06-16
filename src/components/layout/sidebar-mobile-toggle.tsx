"use client";

import { useSidebar } from "@/components/layout/sidebar-provider";

// The mobile ☰ that opens the wiki sidebar drawer. It lives apart from the
// Navbar so the Navbar stays sidebar-agnostic — only sidebar regions inject it
// through the Navbar's `leading` slot.
export function SidebarMobileToggle() {
  const { isMobile, openMobile } = useSidebar();
  if (!isMobile) return null;

  return (
    <button
      onClick={openMobile}
      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
      aria-label="打开导航"
    >
      ☰
    </button>
  );
}
