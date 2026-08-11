"use client";

import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function MobileBottomSheet({
  open,
  onOpenChange,
  finalFocus,
  title,
  closeLabel,
  children,
  height = "compact",
  bottomPadding = "safe",
  viewportTestId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  title: string;
  closeLabel: string;
  children: ReactNode;
  height?: "compact" | "viewport";
  bottomPadding?: "none" | "safe" | "comfortable";
  viewportTestId?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const maxHeight = height === "viewport" ? "max-h-dvh" : "max-h-[82dvh]";

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/30 opacity-100 backdrop-blur-[1px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden" />
        <Drawer.Viewport
          data-testid={viewportTestId}
          className="pointer-events-none fixed inset-0 z-50 flex items-end overflow-clip md:hidden"
        >
          <Drawer.Popup
            initialFocus={closeRef}
            finalFocus={finalFocus}
            className={cn(
              "pointer-events-auto w-full translate-y-0 rounded-t-3xl bg-background shadow-2xl outline-none transition-transform duration-300 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full",
              maxHeight,
            )}
          >
            <Drawer.Content
              className={cn(
                "flex min-h-0 flex-col overflow-hidden",
                maxHeight,
                bottomPadding === "safe" && "pb-[env(safe-area-inset-bottom)]",
                bottomPadding === "comfortable" &&
                  "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
              )}
            >
              <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" />
              <div className="flex min-h-14 shrink-0 items-center border-b px-4">
                <Drawer.Title className="text-lg font-semibold tracking-tight">
                  {title}
                </Drawer.Title>
                <Drawer.Close
                  ref={closeRef}
                  className="ml-auto flex size-11 touch-manipulation items-center justify-center rounded-xl bg-muted text-muted-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={closeLabel}
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </Drawer.Close>
              </div>
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
