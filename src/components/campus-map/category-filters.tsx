"use client";

import { ChevronDownIcon } from "lucide-react";
import type { Ref } from "react";
import { campusMapPlaceTypeStyle } from "@/components/campus-map/browse-card-presentation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CampusMapPublicPlaceType } from "@/lib/campus-map/place-type-contract";
import { CAMPUS_MAP_DISPLAY_REGISTRY } from "@/lib/campus-map/display-registry";
import { cn } from "@/lib/utils";

const moreCategories = CAMPUS_MAP_DISPLAY_REGISTRY.moreBrowseCategories.map(
  campusMapPlaceTypeStyle,
);
const primaryCategories = CAMPUS_MAP_DISPLAY_REGISTRY.browseCategories.map(
  campusMapPlaceTypeStyle,
);

export function CampusMapCategoryFilters({
  activeCategory,
  activeFilterRef,
  moreFilterRef,
  onSelect,
}: {
  activeCategory: CampusMapPublicPlaceType | null;
  activeFilterRef: Ref<HTMLButtonElement>;
  moreFilterRef: Ref<HTMLButtonElement>;
  onSelect: (category: CampusMapPublicPlaceType) => void;
}) {
  const selectedMore = moreCategories.find(({ id }) => id === activeCategory);
  const visibleCategories = selectedMore
    ? [...primaryCategories, selectedMore]
    : primaryCategories;
  return (
    <nav
      aria-label="设施筛选"
      className="pointer-events-auto flex w-full min-w-0 items-center gap-1.5 py-1 md:w-auto md:max-w-[calc(100%-32px)]"
    >
      <div className="flex min-w-0 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] md:gap-2 [&::-webkit-scrollbar]:hidden">
        {visibleCategories.map((category) => {
          const Icon = category.icon;
          const active = activeCategory === category.id;
          return (
            <button
              ref={active ? activeFilterRef : undefined}
              key={category.id}
              type="button"
              data-category-filter={category.id}
              aria-pressed={active}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400 md:text-sm",
                active
                  ? "border-[#176346] bg-[#176346] text-white"
                  : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
              )}
              onClick={() => onSelect(category.id)}
            >
              <Icon aria-hidden="true" className="size-4" />
              {category.label}
            </button>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={moreFilterRef}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-black/10 bg-white px-3 text-[13px] font-medium text-neutral-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400 dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-100"
        >
          更多
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {moreCategories.map((category) => {
            const Icon = category.icon;
            return (
              <DropdownMenuItem
                key={category.id}
                className="min-h-11 gap-2 px-3"
                onClick={() => onSelect(category.id)}
              >
                <Icon aria-hidden="true" className="size-4" />
                {category.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
