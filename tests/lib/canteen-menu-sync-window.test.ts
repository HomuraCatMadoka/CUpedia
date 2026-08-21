import { describe, expect, it } from "vitest";
import { menuSyncWindowAt } from "@/lib/canteen-menu-sync-window";

describe("canteen menu sync windows", () => {
  it.each([
    ["2026-08-19T16:00:00.000Z", "breakfast", "2026-08-20/breakfast"],
    ["2026-08-19T22:00:00.000Z", "breakfast", "2026-08-20/breakfast"],
    ["2026-08-20T02:59:59.999Z", "breakfast", "2026-08-20/breakfast"],
    ["2026-08-20T03:00:00.000Z", "lunch", "2026-08-20/lunch"],
    ["2026-08-20T08:59:59.999Z", "lunch", "2026-08-20/lunch"],
    ["2026-08-20T09:00:00.000Z", "dinner", "2026-08-20/dinner"],
    ["2026-08-20T15:59:59.999Z", "dinner", "2026-08-20/dinner"],
  ] as const)("maps %s to the fixed %s window", (timestamp, period, key) => {
    const window = menuSyncWindowAt(new Date(timestamp));

    expect(window).toMatchObject({ period, key });
    expect(window?.startsAt.getTime()).toBeLessThanOrEqual(
      new Date(timestamp).getTime(),
    );
    expect(window?.endsAt.getTime()).toBeGreaterThan(
      new Date(timestamp).getTime(),
    );
  });
});
