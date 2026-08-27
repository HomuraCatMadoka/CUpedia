const HKT_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

/** Returns a warning only when the last success belongs to an older HKT day. */
export function staleMenuFreshnessLabel(
  lastSuccessAt: Date | null,
  evaluatedAt: Date,
): string | null {
  if (!lastSuccessAt) return null;
  const lastDay = Math.floor(
    (lastSuccessAt.getTime() + HKT_OFFSET_MS) / DAY_MS,
  );
  const evaluatedDay = Math.floor(
    (evaluatedAt.getTime() + HKT_OFFSET_MS) / DAY_MS,
  );
  const ageInDays = evaluatedDay - lastDay;
  if (ageInDays <= 0) return null;
  const time = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(lastSuccessAt);
  if (ageInDays === 1) return `最后同步于昨天 ${time}`;
  const date = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
  }).format(lastSuccessAt);
  return `最后同步于${date} ${time}`;
}
