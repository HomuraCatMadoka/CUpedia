import type { CampusMapRegularHours } from "@/db/schema";

const CAMPUS_MAP_REGULAR_HOURS_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isCampusMapRegularHours(
  value: unknown,
): value is CampusMapRegularHours {
  if (
    !isRecord(value) ||
    value.timezone !== "Asia/Hong_Kong" ||
    !Array.isArray(value.intervals) ||
    value.intervals.length === 0 ||
    Object.keys(value).some((key) => key !== "timezone" && key !== "intervals")
  ) {
    return false;
  }
  const weekdays = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  return value.intervals.every((interval) => {
    if (
      !isRecord(interval) ||
      !Array.isArray(interval.days) ||
      interval.days.length === 0 ||
      new Set(interval.days).size !== interval.days.length ||
      typeof interval.opensAt !== "string" ||
      typeof interval.closesAt !== "string" ||
      !CAMPUS_MAP_REGULAR_HOURS_TIME_PATTERN.test(interval.opensAt) ||
      !CAMPUS_MAP_REGULAR_HOURS_TIME_PATTERN.test(interval.closesAt) ||
      interval.opensAt === interval.closesAt ||
      Object.keys(interval).some(
        (key) => key !== "days" && key !== "opensAt" && key !== "closesAt",
      )
    ) {
      return false;
    }
    return interval.days.every(
      (day) => typeof day === "string" && weekdays.has(day),
    );
  });
}
