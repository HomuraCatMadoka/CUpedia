import { MEAL_PERIODS, type MealPeriod } from "@/lib/canteen-types";
import { cn } from "@/lib/utils";

const LABELS: Record<MealPeriod, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

const STYLES: Record<MealPeriod, string> = {
  breakfast:
    "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
  lunch:
    "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
  dinner:
    "border-indigo-200/80 bg-indigo-50 text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-100",
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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        STYLES[period],
        className,
      )}
    >
      {LABELS[period]}
    </span>
  );
}

export const mealPeriodLabel = LABELS;
