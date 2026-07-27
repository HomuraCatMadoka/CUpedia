import {
  ALLDAY_MEAL_PERIOD,
  MEAL_PERIODS,
  type MealPeriod,
  type MealPeriodAssignment,
} from "@/db/schema";
import { cn } from "@/lib/utils";

const LABELS: Record<MealPeriodAssignment, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  allday: "全天",
};

const STYLES: Record<MealPeriodAssignment, string> = {
  breakfast: "text-[var(--canteen-morning)]",
  lunch: "text-[var(--canteen-noon)]",
  dinner: "text-[var(--canteen-evening)]",
  allday: "text-[var(--canteen-muted)]",
};

export function MealPeriodBadge({
  period,
  className,
}: {
  period: MealPeriodAssignment;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium tracking-wide",
        STYLES[period],
        className,
      )}
    >
      {LABELS[period]}
    </span>
  );
}

export function MealPeriodsBadges({
  periods,
  className,
}: {
  periods: readonly MealPeriodAssignment[];
  className?: string;
}) {
  if (periods.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5", className)}>
      {periods.map((period) => (
        <MealPeriodBadge key={period} period={period} />
      ))}
    </span>
  );
}

/** Tab labels only — never includes 全天. */
export const mealPeriodLabel: Record<MealPeriod, string> = {
  breakfast: LABELS.breakfast,
  lunch: LABELS.lunch,
  dinner: LABELS.dinner,
};

export const mealPeriodAssignmentLabel = LABELS;

export { ALLDAY_MEAL_PERIOD, MEAL_PERIODS };
