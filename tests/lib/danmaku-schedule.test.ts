import { describe, it, expect } from "vitest";
import {
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
    expect(
      earliestNonOverlappingStart(null, 100, 720, 12),
    ).toBe(0);
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
    // Early bullets should share near-zero starts across different tracks.
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
    for (let i = 1; i < scheduled.length; i++) {
      expect(scheduled[i].start).toBeGreaterThanOrEqual(scheduled[i - 1].start);
      expect(scheduled[i].start).toBeGreaterThanOrEqual(
        scheduled[i - 1].start + 0.05 - 1e-9,
      );
    }
  });
});
