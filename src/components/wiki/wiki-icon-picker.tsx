"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const WikiEmojiPickerPanel = dynamic(
  () =>
    import("./wiki-emoji-picker-panel").then(
      (module) => module.WikiEmojiPickerPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="正在载入 Emoji"
        className="h-[min(380px,52dvh)] animate-pulse bg-[#f7f7f5] dark:bg-white/5"
      />
    ),
  },
);

export function WikiIconPicker({
  icon,
  mobileInline = false,
  onIconChange,
}: {
  icon: string | null;
  mobileInline?: boolean;
  onIconChange: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const chooseIcon = (nextIcon: string) => {
    onIconChange(nextIcon);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={icon ? `更改页面图标，当前为 ${icon}` : "添加页面图标"}
        className={cn(
          "w-fit rounded-md text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          icon
            ? cn(
                "flex items-center justify-center leading-none transition-transform hover:scale-[1.03] active:scale-95 motion-reduce:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
                mobileInline
                  ? "size-[38px] shrink-0 text-[30px] md:-ml-1 md:size-auto md:min-h-20 md:min-w-20 md:px-1 md:text-[72px]"
                  : "-ml-1 min-h-18 min-w-18 px-1 text-[64px] md:min-h-20 md:min-w-20 md:text-[72px]",
              )
            : "flex h-11 items-center gap-1 px-2 text-sm font-medium text-[#787774] transition-colors hover:bg-[#f1f1ef] hover:text-[#37352f] sm:h-8",
        )}
      >
        {icon ? (
          <span aria-hidden="true">{icon}</span>
        ) : (
          <>
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            添加图标
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        aria-label="选择页面图标"
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[min(420px,calc(100vw-24px))] gap-0 overflow-hidden rounded-xl bg-white p-0 text-[#37352f] shadow-[0_14px_34px_rgba(15,15,15,0.18),0_0_0_1px_rgba(15,15,15,0.08)] ring-0 dark:bg-[#252525] dark:text-[#efefef]"
      >
        <PopoverTitle className="sr-only">选择页面图标</PopoverTitle>
        <div className="flex h-12 items-end border-b border-black/10 px-4 dark:border-white/10">
          <span className="flex h-12 items-center border-b-2 border-[#37352f] px-1 font-medium dark:border-[#efefef]">
            Emoji
          </span>
          {icon && (
            <button
              type="button"
              onClick={() => {
                onIconChange(null);
                setOpen(false);
              }}
              className="ml-auto flex min-h-11 min-w-11 self-center items-center justify-center rounded px-2 py-1 text-[#787774] hover:bg-[#f1f1ef] hover:text-[#37352f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:mb-2.5 sm:min-h-0 sm:min-w-0 sm:self-auto dark:hover:bg-white/10 dark:hover:text-white"
            >
              移除
            </button>
          )}
        </div>

        {open ? <WikiEmojiPickerPanel onSelect={chooseIcon} /> : null}
      </PopoverContent>
    </Popover>
  );
}
