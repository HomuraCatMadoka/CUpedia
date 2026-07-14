"use client";

import { MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { useSidebar } from "@/components/layout/sidebar-provider";

// The mobile ☰ that opens the wiki sidebar drawer. It lives apart from the
// Navbar so the Navbar stays sidebar-agnostic — only sidebar regions inject it
// through the Navbar's `leading` slot.
export function SidebarMobileToggle() {
  const { isMobile, openMobile } = useSidebar();
  const pathname = usePathname();
  const isWikiRoute = pathname === "/wiki" || pathname.startsWith("/wiki/");

  if (!isMobile || !isWikiRoute) return null;

  return (
    <button
      onClick={openMobile}
      className="flex size-11 touch-manipulation items-center justify-center rounded-md transition-[background-color,transform] hover:bg-accent active:scale-95 active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label="打开导航"
    >
      <MenuIcon aria-hidden="true" className="size-4" />
    </button>
  );
}
