import { describe, it, expect } from "vitest";
import {
  assertLaneNonOverlapping,
  earliestNonOverlappingStart,
  estimateDanmakuWidth,
  scheduleScrollingDanmaku,
} from "@/lib/danmaku-schedule";

describe("danmaku-schedule (bilibili-style lanes)", () => {
  it("estimateDanmakuWidth grows with content", () => {
    expect(estimateDanmakuWidth("hi")).toBeLessThan(
      estimateDanmakuWidth("你好世界弹幕测试"),
    );
  });

  it("first bullet on an empty lane starts at 0", () => {
    expect(earliestNonOverlappingStart(null, 100, 720, 12)).toBe(0);
  });

  it("schedules multiple bullets across parallel tracks without one-per-lane packing", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `d-${i}`,
      content: `弹幕${i}`,
    }));
    const scheduled = scheduleScrollingDanmaku(items, {
      trackCount: 4,
      screenWidth: 720,
      duration: 12,
    });
    expect(scheduled.length).toBe(12);
    const tracksUsed = new Set(scheduled.map((s) => s.track));
    expect(tracksUsed.size).toBeGreaterThan(1);
    const early = scheduled.filter((s) => s.start < 0.01);
    expect(early.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps same-track starts ordered and spaced", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `d-${i}`,
      content: "短",
    }));
    const scheduled = scheduleScrollingDanmaku(items, {
      trackCount: 1,
      screenWidth: 720,
      duration: 12,
    });
    expect(scheduled.length).toBe(8);
    for (let i = 1; i < scheduled.length; i++) {
      expect(scheduled[i].start).toBeGreaterThan(scheduled[i - 1].start);
    }
  });

  it("uses the measured width on narrow embedded boards", () => {
    const screenWidth = 280;
    const scheduled = scheduleScrollingDanmaku(
      Array.from({ length: 12 }, (_, index) => ({
        id: `narrow-${index}`,
        content: `演示弹幕 ${index}`,
      })),
      { trackCount: 1, screenWidth, duration: 12 },
    );

    expect(assertLaneNonOverlapping(scheduled, screenWidth)).toBe(true);
  });

  it("never lets same-lane bullets share horizontal space in the cycle", () => {
    const screenWidth = 720;
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `d-${i}`,
      content: i % 2 === 0 ? "短弹幕" : "稍微长一点的食堂弹幕内容测试",
    }));
    const scheduled = scheduleScrollingDanmaku(items, {
      trackCount: 3,
      screenWidth,
      duration: 12,
      fontPx: 18.4,
    });

    const byTrack = new Map<number, typeof scheduled>();
    for (const item of scheduled) {
      const list = byTrack.get(item.track) ?? [];
      list.push(item);
      byTrack.set(item.track, list);
    }

    for (const lane of byTrack.values()) {
      expect(assertLaneNonOverlapping(lane, screenWidth)).toBe(true);
    }
  });
});
