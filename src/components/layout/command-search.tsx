"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CommandSearchDialog = dynamic(() =>
  import("@/components/layout/command-search-dialog").then(
    (module) => module.CommandSearchDialog,
  ),
);

export function CommandSearch() {
  const [open, setOpen] = useState(false);

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
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex size-11 touch-manipulation items-center justify-center rounded-md text-sm text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground active:scale-95 active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
        aria-label="搜索 (⌘K)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      {open && <CommandSearchDialog open onOpenChange={setOpen} />}
    </>
  );
}
