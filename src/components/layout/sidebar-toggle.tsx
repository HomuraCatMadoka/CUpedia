"use client";

import { MenuIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { WikiCreateButton } from "@/components/wiki/wiki-create-button";

export function SidebarToggle({ canEdit = false }: { canEdit?: boolean } = {}) {
  const { state, toggle } = useSidebar();

  return (
    <div
      data-wiki-sidebar-collapsed-rail=""
      className={cn(
        "hidden h-full w-[var(--sidebar-collapsed-width)] shrink-0 flex-col items-center gap-2 border-r bg-[var(--sidebar-bg)] pt-3 md:flex",
        state === "expanded" && "md:hidden",
      )}
      style={{ borderColor: "var(--sidebar-border-color)" }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="h-7 w-7 text-muted-foreground"
        aria-label="展开导航"
      >
        <MenuIcon aria-hidden="true" className="size-4" />
      </Button>
      {canEdit && (
        <WikiCreateButton
          variant="ghost"
          size="icon"
          aria-label="新建页面"
          className="h-7 w-7 text-muted-foreground"
        >
          <PlusIcon aria-hidden="true" className="size-4" />
        </WikiCreateButton>
      )}
    </div>
  );
}
