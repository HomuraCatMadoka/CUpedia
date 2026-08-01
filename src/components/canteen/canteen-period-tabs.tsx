"use client";

import { useRef, type KeyboardEvent } from "react";
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
      role="group"
      aria-label="餐段"
      className={cn("canteen-segmented", className)}
    >
      {periods.map((period) => (
        <button
          key={period}
          type="button"
          aria-pressed={value === period}
          data-active={value === period}
          onClick={() => onChange(period)}
          className="canteen-segmented-tab"
        >
          <span>{mealPeriodLabel[period]}</span>
        </button>
      ))}
    </div>
  );
}

export type CanteenViewMode = "menu" | "recommend" | "avoid";

const VIEW_LABELS: Record<CanteenViewMode, string> = {
  menu: "菜单",
  recommend: "红榜",
  avoid: "黑榜",
};

const VIEW_MODES: CanteenViewMode[] = ["menu", "recommend", "avoid"];

export function CanteenViewTabs({
  value,
  onChange,
}: {
  value: CanteenViewMode;
  onChange: (mode: CanteenViewMode) => void;
}) {
  const tabRefs = useRef<Record<CanteenViewMode, HTMLButtonElement | null>>({
    menu: null,
    recommend: null,
    avoid: null,
  });

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    mode: CanteenViewMode,
  ) {
    const currentIndex = VIEW_MODES.indexOf(mode);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % VIEW_MODES.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + VIEW_MODES.length) % VIEW_MODES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = VIEW_MODES.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextMode = VIEW_MODES[nextIndex]!;
    onChange(nextMode);
    tabRefs.current[nextMode]?.focus();
  }

  return (
    <div role="tablist" aria-label="菜单视图" className="canteen-view-tabs">
      {VIEW_MODES.map((mode) => (
        <button
          key={mode}
          ref={(element) => {
            tabRefs.current[mode] = element;
          }}
          id={`canteen-view-tab-${mode}`}
          type="button"
          role="tab"
          aria-selected={value === mode}
          aria-controls={`canteen-view-panel-${mode}`}
          tabIndex={value === mode ? 0 : -1}
          data-active={value === mode}
          data-tone={mode}
          onClick={() => onChange(mode)}
          onKeyDown={(event) => handleKeyDown(event, mode)}
          className="canteen-view-tab"
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
