"use client";

import { MenuIcon, SparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProductNavigationLinks } from "./product-navigation-links";

export function MobileProductMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        aria-label="打开产品菜单"
        aria-expanded={open}
        className="flex size-11 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground active:scale-95 active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:hidden"
      >
        <MenuIcon aria-hidden="true" className="size-5" />
      </DialogTrigger>
      <DialogContent
        initialFocus={closeButtonRef}
        showCloseButton={false}
        overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-sm motion-reduce:animate-none"
        className="top-[calc(var(--safe-area-top)+0.5rem)] right-[calc(var(--safe-area-right)+0.5rem)] bottom-[calc(var(--safe-area-bottom)+0.5rem)] left-[calc(var(--safe-area-left)+0.5rem)] h-auto w-auto max-w-none translate-x-0 translate-y-0 grid-rows-[3.5rem_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl bg-background p-0 ring-1 ring-foreground/10 shadow-2xl data-open:slide-in-from-top-2 data-closed:slide-out-to-top-2 motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none sm:max-w-none md:hidden"
      >
        <div className="flex items-center justify-between border-b px-3">
          <DialogTitle className="text-lg font-bold tracking-[-0.035em]">
            CUpedia
          </DialogTitle>
          <DialogClose
            render={
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 touch-manipulation active:scale-95 motion-reduce:transition-none"
                aria-label="关闭产品菜单"
              />
            }
          >
            <XIcon aria-hidden="true" className="size-5" />
          </DialogClose>
        </div>

        <ProductNavigationLinks
          pathname={pathname}
          onNavigate={() => onOpenChange(false)}
        />

        <div className="grid gap-1 border-t px-4 pt-3 pb-3">
          <Link
            href="/updates"
            onNavigate={() => onOpenChange(false)}
            className="flex min-h-11 touch-manipulation items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          >
            <SparklesIcon aria-hidden="true" className="size-4" />
            产品更新
          </Link>
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm text-muted-foreground">
            <span>外观</span>
            <ThemeToggle compact />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
