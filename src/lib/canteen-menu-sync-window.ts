import type { HktWeekday, MealPeriod } from "@/db/schema";
import type { MenuObservationContext } from "./canteen-types";

const HKT_OFFSET_MS = 8 * 60 * 60 * 1_000;

const WINDOW_START_HOURS = {
  breakfast: 0,
  lunch: 11,
  dinner: 17,
} as const satisfies Record<MealPeriod, number>;

const CLAIM_START_HOURS = {
  breakfast: 8,
  lunch: 11,
  dinner: 17,
} as const satisfies Record<MealPeriod, number>;

/** Primary :17-:32 drain plus fallback/grace; operational checks start at :50. */
const INITIAL_DRAIN_DEADLINE_MINUTES_AFTER_CLAIM_START = 50;

export type MenuSyncWindow = {
  key: string;
  period: MealPeriod;
  hktWeekday: HktWeekday;
  startsAt: Date;
  claimsStartAt: Date;
  endsAt: Date;
};

function localBoundaryUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
): Date {
  return new Date(Date.UTC(year, month, day, hour) - HKT_OFFSET_MS);
}

/** Maps database time to the fixed Asia/Hong_Kong scheduling window. */
export function menuSyncWindowAt(databaseNow: Date): MenuSyncWindow {
  const hkt = new Date(databaseNow.getTime() + HKT_OFFSET_MS);
  const year = hkt.getUTCFullYear();
  const month = hkt.getUTCMonth();
  const day = hkt.getUTCDate();
  const hour = hkt.getUTCHours();
  const period: MealPeriod =
    hour >= WINDOW_START_HOURS.dinner
      ? "dinner"
      : hour >= WINDOW_START_HOURS.lunch
        ? "lunch"
        : "breakfast";

  const startHour = WINDOW_START_HOURS[period];
  const endHour =
    period === "breakfast"
      ? WINDOW_START_HOURS.lunch
      : period === "lunch"
        ? WINDOW_START_HOURS.dinner
        : 24;
  const date = `${year.toString().padStart(4, "0")}-${(month + 1)
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

  return {
    key: `${date}/${period}`,
    period,
    // Date#getUTCDay is specified to return an integer in the 0-6 domain.
    hktWeekday: hkt.getUTCDay() as HktWeekday,
    startsAt: localBoundaryUtc(year, month, day, startHour),
    claimsStartAt: localBoundaryUtc(
      year,
      month,
      day,
      CLAIM_START_HOURS[period],
    ),
    endsAt: localBoundaryUtc(year, month, day, endHour),
  };
}

export function menuSyncInitialDrainDeadlineAt(databaseNow: Date): Date {
  const window = menuSyncWindowAt(databaseNow);
  return new Date(
    window.claimsStartAt.getTime() +
      INITIAL_DRAIN_DEADLINE_MINUTES_AFTER_CLAIM_START * 60 * 1_000,
  );
}

/** Early clock labels are diagnostic only and cannot claim scheduled work. */
export function menuSyncWindowAcceptsActivity(
  window: MenuSyncWindow,
  observedAt: Date,
): boolean {
  return (
    observedAt.getTime() >= window.claimsStartAt.getTime() &&
    observedAt.getTime() < window.endsAt.getTime()
  );
}

export function menuObservationCanProjectActivity(
  context: MenuObservationContext,
): boolean {
  const window = menuSyncWindowAt(context.observedAt);
  if (
    window.key !== context.syncWindowKey ||
    window.period !== context.mealPeriod
  ) {
    throw new Error("MENU_OBSERVATION_CONTEXT_MISMATCH");
  }
  return menuSyncWindowAcceptsActivity(window, context.observedAt);
}

export function menuObservationContextAt(
  databaseNow: Date,
): MenuObservationContext {
  const window = menuSyncWindowAt(databaseNow);
  return {
    observedAt: new Date(databaseNow),
    syncWindowKey: window.key,
    mealPeriod: window.period,
  };
}
