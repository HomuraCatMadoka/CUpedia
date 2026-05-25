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

  it("accepts ASCII alphanumeric with underscores", () => {
    expect(validateNickname("test_user")).toEqual({
      ok: true,
      nickname: "test_user",
    });
  });

  it("accepts Chinese (Han) characters", () => {
    expect(validateNickname("小明")).toEqual({ ok: true, nickname: "小明" });
  });

  it("accepts mixed ASCII and Han", () => {
    expect(validateNickname("test_小明")).toEqual({
      ok: true,
      nickname: "test_小明",
    });
  });

  it("accepts spaces between words", () => {
    expect(validateNickname("hello world")).toEqual({
      ok: true,
      nickname: "hello world",
    });
  });

  it("rejects emoji", () => {
    expect(validateNickname("🎉party").ok).toBe(false);
  });

  it("rejects Hiragana", () => {
    expect(validateNickname("こんにちは").ok).toBe(false);
  });

  it("rejects Hangul", () => {
    expect(validateNickname("한국어").ok).toBe(false);
  });

  it("rejects special symbols", () => {
    expect(validateNickname("user@name").ok).toBe(false);
  });

  it("counts Chinese characters correctly", () => {
    const twenty = "你好世界测试名称甲乙丙丁戊己庚辛壬癸子丑";
    expect(twenty.length).toBe(20);
    expect(validateNickname(twenty).ok).toBe(true);
  });
});
