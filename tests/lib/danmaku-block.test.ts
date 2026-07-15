import { describe, it, expect } from "vitest";
import {
  assertDanmakuNotBlocked,
  findDanmakuBlock,
} from "@/lib/danmaku-block";
import { validateDanmakuContent } from "@/lib/danmaku-types";

describe("danmaku-block", () => {
  it("allows ordinary campus chatter", () => {
    expect(findDanmakuBlock("今天食堂炒面还不错")).toBeNull();
    expect(validateDanmakuContent("还有位子吗")).toBe("还有位子吗");
  });

  it("blocks contact / spam keywords", () => {
    expect(findDanmakuBlock("加微信私聊")?.kind).toBe("keyword");
    expect(findDanmakuBlock("兼职刷单来")?.kind).toBe("keyword");
  });

  it("blocks URL and QQ-style regex", () => {
    expect(findDanmakuBlock("看 https://evil.example/x")?.matched).toBe("url");
    expect(findDanmakuBlock("扣扣：12345678")?.matched).toBe("qq_id");
  });

  it("blocks repeated-character spam", () => {
    expect(findDanmakuBlock("哈哈哈哈哈哈哈")?.matched).toBe("repeat_char");
  });

  it("assertDanmakuNotBlocked throws DANMAKU_BLOCKED", () => {
    expect(() => assertDanmakuNotBlocked("加vx领红包")).toThrow(
      "DANMAKU_BLOCKED",
    );
  });
});
