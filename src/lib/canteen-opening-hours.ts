import type { HktWeekday } from "@/db/schema";

const HKT = "Asia/Hong_Kong";
const HKT_TIME_PATTERN = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * One recurring HKT opening window.
 *
 * `closesAt` earlier than `opensAt` means the window crosses midnight (e.g.
 * `22:00`–`01:30`), matching how the Campus Map fact store reads its own
 * `access_schedule` intervals.
 */
export type CanteenOpeningInterval = {
  /** HKT weekdays the window opens on (Sunday = 0), same scale as `HktWeekday`. */
  days: HktWeekday[];
  /** `HH:mm` HKT. */
  opensAt: string;
  /** `HH:mm` HKT. */
  closesAt: string;
};

/**
 * What CUpedia knows about a canteen's opening hours.
 *
 * Mirrors the shape Campus Map already proved out for `access_schedule`
 * (ADR 0040), but keys days by integer `HktWeekday` so it stays on the same
 * scale as `canteen_menu_sources.closed_weekdays`.
 *
 * `unknown` is a first-class value on purpose: "nobody recorded this" must stay
 * distinguishable from "recorded as closed", so the UI never reports a guess as
 * a fact.
 */
export type CanteenOpeningHours =
  | { kind: "unknown" }
  | { kind: "always" }
  | {
      kind: "weekly";
      timezone: "Asia/Hong_Kong";
      intervals: CanteenOpeningInterval[];
    };

export const CANTEEN_OPEN_STATES = ["open", "closed", "unknown"] as const;
export type CanteenOpenState = (typeof CANTEEN_OPEN_STATES)[number];

export type CanteenOpenStatus = {
  state: CanteenOpenState;
  /** Text equivalent, so status is never conveyed by colour alone. */
  label: string;
};

export const CANTEEN_OPEN_LABELS: Record<CanteenOpenState, string> = {
  open: "营业中",
  closed: "已打烊",
  unknown: "营业时间未知",
};

export const CANTEEN_STATUS_OPEN: CanteenOpenStatus = {
  state: "open",
  label: CANTEEN_OPEN_LABELS.open,
};

export const CANTEEN_STATUS_CLOSED: CanteenOpenStatus = {
  state: "closed",
  label: CANTEEN_OPEN_LABELS.closed,
};

export const CANTEEN_STATUS_UNKNOWN: CanteenOpenStatus = {
  state: "unknown",
  label: CANTEEN_OPEN_LABELS.unknown,
};

const HKT_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: HKT,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const HKT_WEEKDAY_INDEX: Record<string, HktWeekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function hktWeekdayAndMinutes(now: Date): {
  weekday: HktWeekday;
  minutes: number;
} {
  const parts = HKT_CLOCK.formatToParts(now);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "";
  const weekday = HKT_WEEKDAY_INDEX[weekdayName];
  if (weekday === undefined) throw new Error("INVALID_HKT_WEEKDAY");
  // `hour12: false` can yield "24" at midnight in some ICU versions.
  const hour =
    Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { weekday, minutes: hour * 60 + minute };
}

function minutesFromHktTime(value: string): number | null {
  if (!HKT_TIME_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

/** HKT weekday (Sunday = 0) for one instant. */
export function hktWeekday(now: Date): HktWeekday {
  return hktWeekdayAndMinutes(now).weekday;
}

/**
 * Status that needs no wall clock. Returns `null` when only a clock can decide,
 * which is exactly the `weekly` case the client resolves after mount.
 */
export function clockFreeCanteenOpenStatus(
  hours: CanteenOpeningHours | null | undefined,
): CanteenOpenStatus | null {
  if (!hours || hours.kind === "unknown") return CANTEEN_STATUS_UNKNOWN;
  if (hours.kind === "always") return CANTEEN_STATUS_OPEN;
  return null;
}

/**
 * Resolve the display status for one canteen at one instant.
 *
 * Pure by design: the instant is always passed in, so callers own the timezone
 * decision and tests can pin it (see `docs/canteen/LESSONS-187-188.md`).
 *
 * A `weekly` schedule with no window covering `now` reports `closed` — the
 * schedule was recorded, and it says this canteen is not serving. Only a
 * missing or explicitly `unknown` schedule reports `unknown`.
 */
export function canteenOpenStatus(
  hours: CanteenOpeningHours | null | undefined,
  now: Date,
): CanteenOpenStatus {
  if (!hours || hours.kind === "unknown") return CANTEEN_STATUS_UNKNOWN;
  if (hours.kind === "always") return CANTEEN_STATUS_OPEN;

  const { weekday, minutes } = hktWeekdayAndMinutes(now);
  const previousDay = ((weekday + 6) % 7) as HktWeekday;

  for (const interval of hours.intervals) {
    if (interval.days.length === 0) continue;
    const opensAt = minutesFromHktTime(interval.opensAt);
    const closesAt = minutesFromHktTime(interval.closesAt);
    if (opensAt === null || closesAt === null || opensAt === closesAt) continue;

    if (opensAt < closesAt) {
      if (
        interval.days.includes(weekday) &&
        minutes >= opensAt &&
        minutes < closesAt
      ) {
        return CANTEEN_STATUS_OPEN;
      }
      continue;
    }

    // Crosses midnight: opened earlier today and is still running ...
    if (interval.days.includes(weekday) && minutes >= opensAt) {
      return CANTEEN_STATUS_OPEN;
    }
    // ... or opened yesterday and has not reached `closesAt` yet.
    if (interval.days.includes(previousDay) && minutes < closesAt) {
      return CANTEEN_STATUS_OPEN;
    }
  }

  return CANTEEN_STATUS_CLOSED;
}

/**
 * Same as `canteenOpenStatus`, but tolerates a clock that does not exist yet.
 *
 * `now === null` means "this client has no clock" (server render, or the first
 * frame before hydration), which is a state client components must render
 * without guessing. Clock-independent schedules still resolve.
 */
export function canteenOpenStatusForClock(
  hours: CanteenOpeningHours | null | undefined,
  now: Date | null,
): CanteenOpenStatus {
  const clockFree = clockFreeCanteenOpenStatus(hours);
  if (clockFree) return clockFree;
  if (now === null || !hours || hours.kind !== "weekly") {
    return CANTEEN_STATUS_UNKNOWN;
  }
  return canteenOpenStatus(hours, now);
}

/** Weekday names as the canteen UI writes them. */
export const HKT_WEEKDAY_LABELS: Record<HktWeekday, string> = {
  0: "周日",
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
};

/** Monday-first reading order, the convention for opening-hours tables here. */
export const CANTEEN_OPENING_WEEK_ORDER: readonly HktWeekday[] = [
  1, 2, 3, 4, 5, 6, 0,
];

export type CanteenOpeningDay = {
  weekday: HktWeekday;
  label: string;
  /** Formatted windows for this weekday; empty when recorded as not serving. */
  windows: string[];
};

/**
 * `08:00 – 20:00`, or `22:00 – 次日 01:30` when the window crosses midnight.
 */
export function formatCanteenOpeningWindow(
  interval: CanteenOpeningInterval,
): string {
  const opensAt = minutesFromHktTime(interval.opensAt);
  const closesAt = minutesFromHktTime(interval.closesAt);
  const crossesMidnight =
    opensAt !== null && closesAt !== null && closesAt < opensAt;
  return crossesMidnight
    ? `${interval.opensAt} – 次日 ${interval.closesAt}`
    : `${interval.opensAt} – ${interval.closesAt}`;
}

/**
 * One display row per weekday for a `weekly` schedule, Monday first.
 *
 * Returns `null` for schedules that carry no weekly table (`unknown`, `always`),
 * so callers decide how to describe those instead of rendering empty rows.
 * Window order is normalised by opening time and duplicates collapse, because
 * stored interval order carries no meaning.
 */
export function canteenOpeningWeek(
  hours: CanteenOpeningHours | null | undefined,
): CanteenOpeningDay[] | null {
  if (!hours || hours.kind !== "weekly") return null;

  return CANTEEN_OPENING_WEEK_ORDER.map((weekday) => {
    const windows = hours.intervals
      .filter((interval) => interval.days.includes(weekday))
      .sort(
        (left, right) =>
          (minutesFromHktTime(left.opensAt) ?? 0) -
          (minutesFromHktTime(right.opensAt) ?? 0),
      )
      .map(formatCanteenOpeningWindow);

    return {
      weekday,
      label: HKT_WEEKDAY_LABELS[weekday],
      windows: [...new Set(windows)],
    };
  });
}

function parseCanteenOpeningInterval(input: unknown): CanteenOpeningInterval {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_OPENING_INTERVAL");
  }
  const row = input as Record<string, unknown>;

  if (!Array.isArray(row.days) || row.days.length === 0) {
    throw new Error("INVALID_OPENING_INTERVAL_DAYS");
  }
  const days = row.days.map((day) => {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error("INVALID_OPENING_INTERVAL_DAYS");
    }
    return day as HktWeekday;
  });
  if (new Set(days).size !== days.length) {
    throw new Error("INVALID_OPENING_INTERVAL_DAYS");
  }

  const { opensAt, closesAt } = row;
  if (typeof opensAt !== "string" || !HKT_TIME_PATTERN.test(opensAt)) {
    throw new Error("INVALID_OPENING_INTERVAL_TIME");
  }
  if (typeof closesAt !== "string" || !HKT_TIME_PATTERN.test(closesAt)) {
    throw new Error("INVALID_OPENING_INTERVAL_TIME");
  }
  if (opensAt === closesAt) throw new Error("INVALID_OPENING_INTERVAL_TIME");

  return { days, opensAt, closesAt };
}

/**
 * Validate untrusted opening hours at an import boundary.
 *
 * An empty `intervals` array is valid and means "recorded as never open";
 * only a missing schedule is `unknown`.
 */
export function parseCanteenOpeningHours(input: unknown): CanteenOpeningHours {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_OPENING_HOURS");
  }
  const row = input as Record<string, unknown>;

  if (row.kind === "unknown") return { kind: "unknown" };
  if (row.kind === "always") return { kind: "always" };
  if (row.kind !== "weekly") throw new Error("INVALID_OPENING_HOURS");
  if (row.timezone !== HKT) throw new Error("INVALID_OPENING_HOURS_TIMEZONE");
  if (!Array.isArray(row.intervals)) throw new Error("INVALID_OPENING_HOURS");

  return {
    kind: "weekly",
    timezone: HKT,
    intervals: row.intervals.map(parseCanteenOpeningInterval),
  };
}
