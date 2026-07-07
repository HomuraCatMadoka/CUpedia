"use client";

import type { MealPeriod } from "@/lib/canteen-types";
import { MEAL_PERIODS } from "@/lib/canteen-types";
import { mealPeriodLabel } from "@/components/canteen/meal-period-badge";
import { cn } from "@/lib/utils";

const PERIOD_TAB_STYLE: Record<MealPeriod, string> = {
  breakfast:
    "data-[active=true]:border-[var(--canteen-morning)] data-[active=true]:text-[var(--canteen-morning)]",
  lunch:
    "data-[active=true]:border-[var(--canteen-noon)] data-[active=true]:text-[var(--canteen-noon)]",
  dinner:
    "data-[active=true]:border-[var(--canteen-evening)] data-[active=true]:text-[var(--canteen-evening)]",
};

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
      className={cn("flex gap-1 rounded-full bg-white/70 p-1 shadow-sm", className)}
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
            "min-h-11 flex-1 rounded-full border border-transparent px-4 text-sm font-medium text-[var(--canteen-muted)] transition-colors",
            PERIOD_TAB_STYLE[period],
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
      className="flex flex-wrap gap-2"
    >
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
            value === mode
              ? "border-[var(--canteen-purple)] bg-[var(--canteen-purple)]/10 text-[var(--canteen-purple)]"
              : "border-[var(--canteen-bamboo)]/30 bg-white/80 text-[var(--canteen-muted)] hover:border-[var(--canteen-purple)]/30",
          )}
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
