/** Build a Date whose HKT wall-clock is hour:minute on a fixed UTC day (for tests). */
export function hktDate(hour: number, minute: number): Date {
  const y = 2026;
  const m = 6;
  const d = 15;
  const utcMs = Date.UTC(y, m - 1, d, hour - 8, minute, 0);
  return new Date(utcMs);
}
