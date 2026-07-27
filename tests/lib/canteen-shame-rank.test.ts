import { afterEach, describe, expect, it } from "vitest";
import {
  getAnonShameDailyLimit,
  hktCalendarDate,
  isShameVotingOpen,
  rankShameCanteens,
  type ShameRankEntry,
} from "@/lib/canteen-shame-rank";
import type { Canteen } from "@/lib/canteen-types";

function canteen(id: string, name: string): Canteen {
  const t = new Date("2026-07-27T00:00:00Z");
  return {
    id,
    name,
    location: null,
    announcement: null,
    createdAt: t,
    updatedAt: t,
  };
}

describe("getAnonShameDailyLimit", () => {
  const prev = process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT;

  afterEach(() => {
    if (prev === undefined) delete process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT;
    else process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT = prev;
  });

  it("defaults to 50", () => {
    delete process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT;
    expect(getAnonShameDailyLimit()).toBe(50);
  });

  it("reads positive env override", () => {
    process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT = "10";
    expect(getAnonShameDailyLimit()).toBe(10);
  });

  it("falls back when the configured limit floors below one", () => {
    process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT = "0.5";
    expect(getAnonShameDailyLimit()).toBe(50);
  });
});

describe("hktCalendarDate", () => {
  it("returns Asia/Hong_Kong calendar date as YYYY-MM-DD", () => {
    // 2026-07-26 16:00 UTC = 2026-07-27 00:00 HKT
    expect(hktCalendarDate(new Date("2026-07-26T16:00:00Z"))).toBe(
      "2026-07-27",
    );
    // Still previous HKT day just before midnight
    expect(hktCalendarDate(new Date("2026-07-26T15:59:00Z"))).toBe(
      "2026-07-26",
    );
  });
});

describe("isShameVotingOpen", () => {
  it("keeps the configured end date open and closes the following day", () => {
    expect(isShameVotingOpen("2026-09-01", "2026-09-01")).toBe(true);
    expect(isShameVotingOpen("2026-09-02", "2026-09-01")).toBe(false);
  });
});

describe("rankShameCanteens", () => {
  it("ranks by today's dislike count descending and includes zero-count canteens last", () => {
    const canteens = [
      canteen("a", "甲食堂"),
      canteen("b", "乙食堂"),
      canteen("c", "丙食堂"),
    ];
    const counts = { a: 3, b: 10, c: 0 };
    const ranked = rankShameCanteens(canteens, counts);
    expect(ranked.map((e: ShameRankEntry) => e.canteen.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(ranked[0].dislikes).toBe(10);
  });

  it("breaks ties by canteen id ascending for stable order", () => {
    const canteens = [canteen("z", "张食堂"), canteen("a", "阿食堂")];
    const ranked = rankShameCanteens(canteens, { z: 5, a: 5 });
    expect(ranked.map((e) => e.canteen.id)).toEqual(["a", "z"]);
  });
});
