"use client";

import dynamic from "next/dynamic";
import { SearchIcon } from "lucide-react";
import { useEffect } from "react";

const CommandSearchDialog = dynamic(() =>
  import("@/components/layout/command-search-dialog").then(
    (module) => module.CommandSearchDialog,
  ),
);

export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [onOpenChange, open]);

  return (
    <>
      <button
        onClick={() => onOpenChange(true)}
        className="flex size-11 touch-manipulation items-center justify-center rounded-md text-sm text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground active:scale-95 active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:size-8"
        aria-label="搜索 (⌘K)"
      >
        <SearchIcon aria-hidden="true" className="size-4" />
      </button>

      {open && <CommandSearchDialog open onOpenChange={onOpenChange} />}
    </>
  );
}
