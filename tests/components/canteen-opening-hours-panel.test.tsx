/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { CanteenOpeningHoursPanel } from "@/components/canteen/canteen-opening-hours-panel";
import type { CanteenOpeningHours } from "@/lib/canteen-opening-hours";

/** Monday–Friday 08:00–20:00 HKT; the weekend is recorded as not serving. */
const WEEKDAYS_ONLY: CanteenOpeningHours = {
  kind: "weekly",
  timezone: "Asia/Hong_Kong",
  intervals: [
    { days: [1, 2, 3, 4, 5], opensAt: "08:00", closesAt: "20:00" },
  ],
};

function rowTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".canteen-hours-row")].map(
    (row) => row.textContent ?? "",
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  // Monday 12:00 HKT — inside WEEKDAYS_ONLY and therefore open.
  vi.setSystemTime(new Date("2026-03-02T12:00:00+08:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CanteenOpeningHoursPanel", () => {
  it("lists all seven days and marks the current one", () => {
    const { container } = render(
      <CanteenOpeningHoursPanel openingHours={WEEKDAYS_ONLY} />,
    );

    const rows = rowTexts(container);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toContain("周一");
    expect(rows[0]).toContain("08:00 – 20:00");
    expect(rows[6]).toContain("周日");

    const today = container.querySelector(".canteen-hours-row--today");
    expect(today?.textContent).toContain("周一");
    expect(container.querySelectorAll(".canteen-hours-row--today")).toHaveLength(
      1,
    );
  });

  it("marks recorded non-serving days as closed", () => {
    const { container } = render(
      <CanteenOpeningHoursPanel openingHours={WEEKDAYS_ONLY} />,
    );

    const rows = rowTexts(container);
    expect(rows[5]).toContain("周六");
    expect(rows[5]).toContain("休息");
    expect(rows[6]).toContain("休息");
  });

  it("shows the live status beside the title", () => {
    const { container } = render(
      <CanteenOpeningHoursPanel openingHours={WEEKDAYS_ONLY} />,
    );
    expect(container.querySelector(".canteen-hours-status")?.textContent).toBe(
      "营业中",
    );
  });

  it("reports closed outside the recorded window", () => {
    vi.setSystemTime(new Date("2026-03-02T21:00:00+08:00"));
    const { container } = render(
      <CanteenOpeningHoursPanel openingHours={WEEKDAYS_ONLY} />,
    );
    expect(container.querySelector(".canteen-hours-status")?.textContent).toBe(
      "已打烊",
    );
  });

  it("joins several windows for one day", () => {
    const { container } = render(
      <CanteenOpeningHoursPanel
        openingHours={{
          kind: "weekly",
          timezone: "Asia/Hong_Kong",
          intervals: [
            { days: [1], opensAt: "08:00", closesAt: "11:30" },
            { days: [1], opensAt: "17:30", closesAt: "21:00" },
          ],
        }}
      />,
    );
    expect(rowTexts(container)[0]).toContain("08:00 – 11:30、17:30 – 21:00");
  });

  it("says so when no hours were recorded", () => {
    const { container } = render(
      <CanteenOpeningHoursPanel openingHours={undefined} />,
    );
    expect(container.querySelectorAll(".canteen-hours-row")).toHaveLength(0);
    expect(container.querySelector(".canteen-hours-note")?.textContent).toBe(
      "暂未收录营业时间",
    );
    expect(container.querySelector(".canteen-hours-status")?.textContent).toBe(
      "营业时间未知",
    );
  });

  it("describes an always-open schedule without a table", () => {
    const { container } = render(
      <CanteenOpeningHoursPanel openingHours={{ kind: "always" }} />,
    );
    expect(container.querySelectorAll(".canteen-hours-row")).toHaveLength(0);
    expect(container.querySelector(".canteen-hours-note")?.textContent).toBe(
      "全天营业",
    );
    expect(container.querySelector(".canteen-hours-status")?.textContent).toBe(
      "营业中",
    );
  });

  it("does not pick a day or a status from the server clock", () => {
    // The server instant is inside Monday's window, but the server must not say
    // so: doing that would fork markup from the client.
    const html = renderToString(
      <CanteenOpeningHoursPanel openingHours={WEEKDAYS_ONLY} />,
    );
    expect(html).toContain("周一");
    expect(html).toContain("营业时间未知");
    expect(html).not.toContain("canteen-hours-row--today");
    expect(html).not.toContain("营业中");
  });
});
