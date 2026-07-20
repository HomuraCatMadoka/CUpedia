"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { ProfessionalAchievementDialog } from "@/components/courses/professional-achievement-dialog";
import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfessionalAchievementInventoryProgramme } from "@/lib/achievement-inventory";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const TIER_RANK = {
  gold: 0,
  silver: 1,
  bronze: 2,
} as const;

function progressRatio(item: ProfessionalAchievementInventoryProgramme) {
  if (!item.next || item.next.requiredCount === 0) return 0;
  return item.next.matchedCount / item.next.requiredCount;
}

export function sortProfessionalAchievementInventory(
  items: ProfessionalAchievementInventoryProgramme[],
) {
  return [...items].sort((a, b) => {
    if (a.current && !b.current) return -1;
    if (!a.current && b.current) return 1;

    if (a.current && b.current) {
      const tierDifference =
        TIER_RANK[a.current.tier] - TIER_RANK[b.current.tier];
      if (tierDifference) return tierDifference;
    }

    const aReady = Boolean(a.next?.eligible);
    const bReady = Boolean(b.next?.eligible);
    if (aReady !== bReady) return aReady ? -1 : 1;

    if (!a.current && !b.current) {
      const ratioDifference = progressRatio(b) - progressRatio(a);
      if (ratioDifference) return ratioDifference;
      const countDifference =
        (b.next?.matchedCount ?? 0) - (a.next?.matchedCount ?? 0);
      if (countDifference) return countDifference;
    }

    return a.badgeCode.localeCompare(b.badgeCode);
  });
}

function inventoryLabel(item: ProfessionalAchievementInventoryProgramme) {
  if (item.current && item.next?.eligible) {
    return `${item.displayName}，可以升级`;
  }
  if (!item.current && item.next?.eligible) {
    return `${item.displayName}，可以领取`;
  }
  if (item.current) return `${item.displayName}，已获得`;
  if (item.next) {
    return `${item.displayName}，进度 ${item.next.matchedCount}/${item.next.requiredCount}`;
  }
  return item.displayName;
}

export function ProfessionalAchievementInventory({
  items,
  primaryAchievementId,
}: {
  items: ProfessionalAchievementInventoryProgramme[];
  primaryAchievementId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const orderedItems = useMemo(
    () => sortProfessionalAchievementInventory(items),
    [items],
  );
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return orderedItems;
    return orderedItems.filter(
      (item) =>
        item.badgeCode.toLocaleLowerCase().includes(normalized) ||
        item.displayName.toLocaleLowerCase().includes(normalized),
    );
  }, [orderedItems, query]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selected = items.find((item) => item.programmeKey === selectedKey);

  return (
    <>
      <section aria-labelledby="professional-achievements" className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold" id="professional-achievements">
            专业成就
          </h2>
          <span className="text-xs text-muted-foreground">
            共 {filteredItems.length} 个
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <h3 className="text-sm font-medium">成就列表</h3>
            <label className="relative w-36 sm:w-44">
              <span className="sr-only">搜索专业成就</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索专业成就"
                className="pl-8"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索专业"
                type="search"
                value={query}
              />
            </label>
          </div>

          {visibleItems.length > 0 ? (
            <div
              aria-label="专业成就背包"
              className="grid grid-cols-2 gap-px bg-border p-px sm:grid-cols-3 lg:grid-cols-6"
            >
              {visibleItems.map((item) => {
                const actionable = Boolean(item.next?.eligible);
                const logoTier =
                  item.current?.tier ?? item.tiers[0]?.tier ?? "bronze";
                return (
                  <button
                    aria-label={inventoryLabel(item)}
                    className={cn(
                      "relative flex min-h-24 cursor-pointer flex-col items-center justify-center bg-card px-3 py-3 outline-none transition-colors hover:bg-muted/45 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      actionable && "bg-amber-50/35 hover:bg-amber-50/60",
                    )}
                    key={item.programmeKey}
                    onClick={() => setSelectedKey(item.programmeKey)}
                    type="button"
                  >
                    {actionable && (
                      <span
                        aria-hidden="true"
                        className="absolute top-3 right-3 size-1.5 rounded-full bg-amber-600 ring-2 ring-amber-600/15"
                      />
                    )}
                    <ProfessionalBadgeLogo
                      className={cn(
                        "-my-3",
                        !item.current && "grayscale opacity-40",
                      )}
                      code={item.badgeCode}
                      size={72}
                      tier={logoTier}
                    />
                    {!item.current && item.next && (
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {item.next.matchedCount}/{item.next.requiredCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground">
              没有找到这个专业成就
            </div>
          )}

          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {items.length} 个成就
            </span>
            <div className="flex items-center gap-3">
              <Button
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                size="sm"
                type="button"
                variant="outline"
              >
                上一页
              </Button>
              <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
                {currentPage} / {pageCount}
              </span>
              <Button
                disabled={currentPage >= pageCount}
                onClick={() =>
                  setPage((value) => Math.min(pageCount, value + 1))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      </section>

      <ProfessionalAchievementDialog
        item={selected ?? null}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
        open={Boolean(selected)}
        primaryAchievementId={primaryAchievementId}
      />
    </>
  );
}
