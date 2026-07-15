"use client";

import Link from "next/link";
import { MenuIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSidebar } from "@/components/layout/sidebar-provider";

export function SidebarToggle({ canEdit = false }: { canEdit?: boolean } = {}) {
  const { state, toggle } = useSidebar();

  return (
    <div
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
        <Link
          href="/wiki/new"
          aria-label="新建页面"
          className={buttonVariants({
            variant: "ghost",
            size: "icon",
            className: "h-7 w-7 text-muted-foreground",
          })}
        >
          <PlusIcon aria-hidden="true" className="size-4" />
        </Link>
      )}
    </div>
  );
}
