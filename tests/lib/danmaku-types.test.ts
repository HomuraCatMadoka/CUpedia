import { describe, it, expect } from "vitest";
import {
  DANMAKU_MAX_LENGTH,
  distributeDanmakuToTracks,
  validateDanmakuContent,
} from "@/lib/danmaku-types";

describe("danmaku-types", () => {
  it("validateDanmakuContent rejects empty, HTML, and overlong text", () => {
    expect(() => validateDanmakuContent("")).toThrow("INVALID_DANMAKU");
    expect(() => validateDanmakuContent("<b>x</b>")).toThrow("INVALID_DANMAKU");
    expect(() =>
      validateDanmakuContent("x".repeat(DANMAKU_MAX_LENGTH + 1)),
    ).toThrow("INVALID_DANMAKU");
  });

  it("validateDanmakuContent trims valid text", () => {
    expect(validateDanmakuContent("  你好  ")).toBe("你好");
  });

  it("distributeDanmakuToTracks spreads evenly across tracks", () => {
    const items = Array.from({ length: 500 }, (_, i) => i);
    const tracks = distributeDanmakuToTracks(items, 3);
    expect(tracks[0]).toHaveLength(167);
    expect(tracks[1]).toHaveLength(167);
    expect(tracks[2]).toHaveLength(166);
    expect(tracks.flat()).toHaveLength(500);
  });
});
