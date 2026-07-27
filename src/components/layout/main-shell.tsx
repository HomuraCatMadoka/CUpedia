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
      {!focusedEditor && <Navbar leading={<SidebarMobileToggle />} />}
      <main
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
