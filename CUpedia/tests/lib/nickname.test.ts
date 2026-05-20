import { describe, it, expect } from "vitest";
import { normalizeNickname, validateNickname } from "@/lib/nickname";

describe("normalizeNickname", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeNickname("  hello  ")).toBe("hello");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeNickname("hello   world")).toBe("hello world");
  });

  it("trims and collapses together", () => {
    expect(normalizeNickname("  a   b   c  ")).toBe("a b c");
  });
});

describe("validateNickname", () => {
  it("accepts valid 2-char nickname", () => {
    expect(validateNickname("AB")).toEqual({ ok: true, nickname: "AB" });
  });

  it("accepts valid 20-char nickname", () => {
    expect(validateNickname("a".repeat(20))).toEqual({
      ok: true,
      nickname: "a".repeat(20),
    });
  });

  it("normalizes before validating", () => {
    expect(validateNickname("  hello   world  ")).toEqual({
      ok: true,
      nickname: "hello world",
    });
  });

  it("rejects length below 2 after normalization", () => {
    const result = validateNickname("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it("rejects empty string", () => {
    const result = validateNickname("");
    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only", () => {
    const result = validateNickname("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects length above 20 grapheme clusters", () => {
    const result = validateNickname("a".repeat(21));
    expect(result.ok).toBe(false);
  });

  it("rejects control characters", () => {
    const result = validateNickname("ab\x00cd");
    expect(result.ok).toBe(false);
  });

  it("rejects newlines", () => {
    const result = validateNickname("ab\ncd");
    expect(result.ok).toBe(false);
  });

  it("rejects tab characters", () => {
    const result = validateNickname("ab\tcd");
    expect(result.ok).toBe(false);
  });

  it("counts emoji by grapheme cluster", () => {
    // 20 emoji = 20 grapheme clusters, should pass
    const twentyEmoji = "😀".repeat(20);
    expect(validateNickname(twentyEmoji)).toEqual({
      ok: true,
      nickname: twentyEmoji,
    });

    // 21 emoji = 21 grapheme clusters, should fail
    const twentyOneEmoji = "😀".repeat(21);
    expect(validateNickname(twentyOneEmoji).ok).toBe(false);
  });

  it("counts combining characters by grapheme cluster", () => {
    // é = e + combining acute = 1 grapheme cluster
    const withCombining = "é".repeat(20);
    expect(validateNickname(withCombining).ok).toBe(true);

    const tooMany = "é".repeat(21);
    expect(validateNickname(tooMany).ok).toBe(false);
  });

  it("allows duplicate-looking plain strings", () => {
    expect(validateNickname("test").ok).toBe(true);
    expect(validateNickname("test").ok).toBe(true);
  });

  it("counts Chinese characters correctly", () => {
    const twenty = "你好世界测试名称甲乙丙丁戊己庚辛壬癸子丑";
    expect(twenty.length).toBe(20);
    expect(validateNickname(twenty).ok).toBe(true);
  });
});
