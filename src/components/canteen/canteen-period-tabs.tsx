"use client";

import type { MealPeriod } from "@/lib/canteen-types";
import { mealPeriodLabel } from "@/components/canteen/meal-period-badge";
import { cn } from "@/lib/utils";

export function CanteenPeriodTabs({
  value,
  onChange,
  periods,
  className,
}: {
  value: MealPeriod;
  onChange: (period: MealPeriod) => void;
  /** Only periods this canteen actually serves (hide breakfast/dinner if absent). */
  periods: MealPeriod[];
  className?: string;
}) {
  if (periods.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="餐段"
      className={cn(
        "flex min-w-0 gap-0 border-b border-[var(--canteen-line)]",
        className,
      )}
    >
      {periods.map((period) => (
        <button
          key={period}
          type="button"
          role="tab"
          aria-selected={value === period}
          data-active={value === period}
          onClick={() => onChange(period)}
          className={cn(
            "min-h-11 flex-1 touch-manipulation border-b-2 px-2 text-sm font-medium transition-colors sm:px-4",
            value === period
              ? "border-[var(--canteen-purple)] text-[var(--canteen-ink)]"
              : "border-transparent text-[var(--canteen-muted)] hover:text-[var(--canteen-ink)]",
          )}
        >
          {mealPeriodLabel[period]}
        </button>
      ))}
    </div>
  );
}

export type CanteenViewMode = "menu" | "recommend" | "avoid";

const VIEW_LABELS: Record<CanteenViewMode, string> = {
  recommend: "红榜",
  avoid: "黑榜",
  menu: "菜单",
};

const VIEW_TAB_COLOR: Record<CanteenViewMode, string> = {
  recommend: "text-red-600",
  avoid: "text-black",
  menu: "text-[var(--canteen-muted)]",
};

const VIEW_TAB_ACTIVE: Record<CanteenViewMode, string> = {
  recommend: "text-red-600 underline",
  avoid: "text-black underline",
  menu: "text-[var(--canteen-purple)] underline",
};

export function CanteenViewTabs({
  value,
  onChange,
}: {
  value: CanteenViewMode;
  onChange: (mode: CanteenViewMode) => void;
}) {
  const modes: CanteenViewMode[] = ["recommend", "avoid", "menu"];
  return (
    <div
      role="tablist"
      aria-label="视图"
      className="flex flex-wrap gap-x-3 gap-y-1 sm:gap-x-4 sm:gap-y-2"
    >
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            "min-h-11 touch-manipulation text-sm font-medium underline-offset-4 transition-colors",
            value === mode ? VIEW_TAB_ACTIVE[mode] : VIEW_TAB_COLOR[mode],
            value !== mode &&
              mode === "menu" &&
              "hover:text-[var(--canteen-ink)]",
            value !== mode && mode === "recommend" && "hover:text-red-700",
            value !== mode && mode === "avoid" && "hover:text-neutral-800",
          )}
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
