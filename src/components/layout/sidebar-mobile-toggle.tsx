"use client";

import { ListTreeIcon, MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { useSidebar } from "@/components/layout/sidebar-provider";

// The mobile ☰ that opens the wiki sidebar drawer. It lives apart from the
// Navbar so the Navbar stays sidebar-agnostic — only sidebar regions inject it
// through the Navbar's `leading` slot.
export function SidebarMobileToggle({
  editor = false,
}: {
  editor?: boolean;
} = {}) {
  const { state, openMobile, mobileTriggerRef } = useSidebar();
  const pathname = usePathname();
  const isWikiRoute = pathname === "/wiki" || pathname.startsWith("/wiki/");

  if (!isWikiRoute) return null;

  return (
    <button
      ref={mobileTriggerRef}
      onClick={openMobile}
      className="flex size-11 touch-manipulation items-center justify-center rounded-md transition-[background-color,transform] hover:bg-accent active:scale-95 active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:hidden"
      aria-label={editor ? "打开导航" : "打开 Wiki 目录"}
      aria-controls="wiki-mobile-drawer"
      aria-expanded={state === "mobile-open"}
      aria-haspopup="dialog"
    >
      {editor ? (
        <MenuIcon aria-hidden="true" className="size-6 stroke-[1.8]" />
      ) : (
        <ListTreeIcon aria-hidden="true" className="size-5 stroke-[1.8]" />
      )}
    </button>
  );
}
