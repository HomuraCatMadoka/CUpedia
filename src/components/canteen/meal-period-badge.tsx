import { MEAL_PERIODS, type MealPeriod } from "@/lib/canteen-types";
import { cn } from "@/lib/utils";

const LABELS: Record<MealPeriod, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

const STYLES: Record<MealPeriod, string> = {
  breakfast: "text-[var(--canteen-morning)]",
  lunch: "text-[var(--canteen-noon)]",
  dinner: "text-[var(--canteen-evening)]",
};

export function MealPeriodBadge({
  period,
  className,
}: {
  period: MealPeriod;
  className?: string;
}) {
  if (!(MEAL_PERIODS as readonly string[]).includes(period)) return null;
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

export const mealPeriodLabel = LABELS;
