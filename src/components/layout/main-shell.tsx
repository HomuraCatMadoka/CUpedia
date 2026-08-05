"use client";

import { usePathname } from "next/navigation";

import { Navbar } from "@/components/layout/navbar";
import { SidebarMobileToggle } from "@/components/layout/sidebar-mobile-toggle";
import { cn } from "@/lib/utils";
import { isFocusedWikiEditorRoute } from "@/lib/wiki-routes";

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const focusedEditor = isFocusedWikiEditorRoute(pathname);

  return (
    <>
      {!focusedEditor && (
        <>
          <a
            href="#main-content"
            className="sr-only fixed top-3 left-3 z-100 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            跳到主要内容
          </a>
          <Navbar leading={<SidebarMobileToggle />} />
        </>
      )}
      <main
        id="main-content"
        className={cn(
          "flex min-w-0",
          focusedEditor
            ? "min-h-dvh"
            : "min-h-[calc(100dvh-var(--navbar-height))]",
        )}
        data-focused-wiki-editor={focusedEditor ? "true" : undefined}
      >
        {children}
      </main>
    </>
  );
}
