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
      className={cn("canteen-segmented", className)}
    >
      {periods.map((period) => (
        <button
          key={period}
          type="button"
          role="tab"
          aria-selected={value === period}
          data-active={value === period}
          onClick={() => onChange(period)}
          className="canteen-segmented-tab"
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
      className="flex flex-wrap gap-1.5 sm:gap-2"
    >
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          data-active={value === mode}
          data-tone={mode}
          onClick={() => onChange(mode)}
          className="canteen-view-pill"
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
