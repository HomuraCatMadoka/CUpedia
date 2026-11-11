"use client";

import { CanteenOpenDot } from "@/components/canteen/canteen-open-dot";
import { useHktNow } from "@/hooks/use-hkt-clock";
import {
  canteenOpeningWeek,
  canteenOpenStatusForClock,
  hktWeekday,
  type CanteenOpeningHours,
} from "@/lib/canteen-opening-hours";
import { cn } from "@/lib/utils";

/**
 * Weekly opening-hours box for a canteen detail page.
 *
 * The table itself is clock-independent, so only "which row is today" and the
 * status chip wait for a client clock. Until then no row is marked and the
 * status reads unknown, which keeps the first frame identical to the server's.
 */
export function CanteenOpeningHoursPanel({
  openingHours,
  className,
}: {
  openingHours?: CanteenOpeningHours | null;
  className?: string;
}) {
  const now = useHktNow();
  const status = canteenOpenStatusForClock(openingHours, now);
  const todayWeekday = now === null ? null : hktWeekday(now);
  const week = canteenOpeningWeek(openingHours);

  return (
    <section
      className={cn("canteen-hours-panel", className)}
      aria-labelledby="canteen-hours-heading"
    >
      <header className="canteen-hours-head">
        <h2 id="canteen-hours-heading" className="canteen-hours-title">
          营业时间
        </h2>
        <p className="canteen-hours-status">
          <CanteenOpenDot status={status} />
          <span>{status.label}</span>
        </p>
      </header>

      {week ? (
        <dl className="canteen-hours-week">
          {week.map((day) => {
            const isToday = day.weekday === todayWeekday;
            const isClosed = day.windows.length === 0;
            return (
              <div
                key={day.weekday}
                className={cn(
                  "canteen-hours-row",
                  isToday && "canteen-hours-row--today",
                )}
              >
                <dt className="canteen-hours-day">
                  {day.label}
                  {isToday ? <span className="sr-only">（今天）</span> : null}
                </dt>
                <dd
                  className={cn(
                    "canteen-hours-windows",
                    isClosed && "canteen-hours-windows--closed",
                  )}
                >
                  {isClosed ? "休息" : day.windows.join("、")}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="canteen-hours-note">
          {openingHours?.kind === "always" ? "全天营业" : "暂未收录营业时间"}
        </p>
      )}
    </section>
  );
}
