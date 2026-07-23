"use client";

import type { MealPeriod } from "@/lib/canteen-types";
import { MEAL_PERIODS } from "@/lib/canteen-types";
import { mealPeriodLabel } from "@/components/canteen/meal-period-badge";
import { cn } from "@/lib/utils";

export function CanteenPeriodTabs({
  value,
  onChange,
  className,
}: {
  value: MealPeriod;
  onChange: (period: MealPeriod) => void;
  className?: string;
}) {
  const periods: MealPeriod[] = [...MEAL_PERIODS];
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
  menu: "菜单",
  recommend: "大众推荐",
  avoid: "大众避雷",
};

export function CanteenViewTabs({
  value,
  onChange,
}: {
  value: CanteenViewMode;
  onChange: (mode: CanteenViewMode) => void;
}) {
  const modes: CanteenViewMode[] = ["menu", "recommend", "avoid"];
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
            value === mode
              ? "text-[var(--canteen-purple)] underline"
              : "text-[var(--canteen-muted)] hover:text-[var(--canteen-ink)]",
          )}
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
