"use client";

import { MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback } from "react";

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
  const markClientReady = useCallback(
    (element: HTMLButtonElement | null) => {
      mobileTriggerRef.current = element;
      if (element) element.dataset.clientReady = "true";
    },
    [mobileTriggerRef],
  );

  if (!isWikiRoute) return null;

  return (
    <button
      ref={markClientReady}
      onClick={openMobile}
      className="flex size-11 touch-manipulation items-center justify-center rounded-md transition-[background-color,transform] hover:bg-accent active:scale-95 active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:hidden"
      aria-label="打开导航"
      aria-controls="wiki-mobile-drawer"
      aria-expanded={state === "mobile-open"}
      aria-haspopup="dialog"
      data-client-ready="false"
    >
      <MenuIcon
        aria-hidden="true"
        className={editor ? "size-6 stroke-[1.8]" : "size-4"}
      />
    </button>
  );
}
