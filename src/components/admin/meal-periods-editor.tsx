"use client";

import { mealPeriodAssignmentLabel } from "@/components/canteen/meal-period-badge";
import {
  ALLDAY_MEAL_PERIOD,
  MEAL_PERIOD_VALUES,
  MEAL_PERIODS,
  type MealPeriodAssignment,
} from "@/lib/canteen-types";

function toggleMealPeriod(
  current: readonly MealPeriodAssignment[],
  period: MealPeriodAssignment,
): MealPeriodAssignment[] {
  if (period === ALLDAY_MEAL_PERIOD) return [ALLDAY_MEAL_PERIOD];

  const withoutAllDay = current.filter((item) => item !== ALLDAY_MEAL_PERIOD);
  if (withoutAllDay.includes(period)) {
    const next = withoutAllDay.filter((item) => item !== period);
    return next.length > 0 ? next : [ALLDAY_MEAL_PERIOD];
  }
  return MEAL_PERIODS.filter(
    (item) => withoutAllDay.includes(item) || item === period,
  );
}

export function MealPeriodsEditor({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: readonly MealPeriodAssignment[];
  onChange: (next: MealPeriodAssignment[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-[var(--canteen-muted)]">
        餐段
      </legend>
      <div className="flex flex-wrap gap-3">
        {MEAL_PERIOD_VALUES.map((period) => {
          const inputId = `${idPrefix}-${period}`;
          return (
            <label
              key={period}
              htmlFor={inputId}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--canteen-ink)]"
            >
              <input
                id={inputId}
                type="checkbox"
                checked={value.includes(period)}
                disabled={disabled}
                onChange={() => onChange(toggleMealPeriod(value, period))}
                className="size-3.5 accent-[var(--canteen-focus)]"
              />
              {mealPeriodAssignmentLabel[period]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
