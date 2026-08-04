"use client";

import { ChevronDown } from "lucide-react";
import type { MenuSection } from "@/lib/canteen-menu-sections";
import type { MealPeriod } from "@/lib/canteen-types";
import { mealPeriodLabel } from "@/components/canteen/meal-period-badge";
import { cn } from "@/lib/utils";

export function CanteenMealSidebar({
  periods,
  sectionsByPeriod,
  currentPeriod,
  expandedPeriod,
  activeSection,
  showCategories,
  onPreparePeriodToggle,
  onTogglePeriod,
  onSelectSection,
}: {
  periods: MealPeriod[];
  sectionsByPeriod: Record<MealPeriod, MenuSection[]>;
  currentPeriod: MealPeriod;
  expandedPeriod: MealPeriod | null;
  activeSection: string;
  showCategories: boolean;
  onPreparePeriodToggle: (period: MealPeriod) => void;
  onTogglePeriod: (period: MealPeriod) => void;
  onSelectSection: (
    period: MealPeriod,
    sectionKey: MenuSection["svgKey"],
  ) => void;
}) {
  return (
    <nav className="canteen-meal-nav" aria-label="餐段与菜单分类">
      {periods.map((period) => {
        const expanded = expandedPeriod === period;
        const sections = sectionsByPeriod[period];
        return (
          <div key={period} className="canteen-meal-nav-group">
            <button
              type="button"
              aria-expanded={showCategories ? expanded : undefined}
              aria-controls={
                showCategories ? `canteen-meal-categories-${period}` : undefined
              }
              data-current={currentPeriod === period}
              data-expanded={expanded}
              onPointerDown={() => onPreparePeriodToggle(period)}
              onClick={() => onTogglePeriod(period)}
              className="canteen-meal-period-button"
            >
              <span>{mealPeriodLabel[period]}</span>
              {showCategories ? (
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform motion-reduce:transition-none",
                    expanded && "rotate-180",
                  )}
                  strokeWidth={1.75}
                  aria-hidden
                />
              ) : null}
            </button>
            {expanded && showCategories ? (
              <div
                id={`canteen-meal-categories-${period}`}
                className="canteen-category-nav"
              >
                {sections.map((section) => {
                  const active =
                    currentPeriod === period &&
                    activeSection === section.svgKey;
                  return (
                    <button
                      key={section.svgKey}
                      type="button"
                      data-active={active}
                      aria-current={active ? "location" : undefined}
                      onClick={() => onSelectSection(period, section.svgKey)}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
