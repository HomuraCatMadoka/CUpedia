import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoSensitiveContent,
  containsSensitiveContent,
  resetSensitiveMatcherForTests,
} from "@/lib/sensitive-content";

afterEach(() => {
  resetSensitiveMatcherForTests(null);
});

describe("sensitive-content", () => {
  it("allows clean campus-style text with the injected lexicon", () => {
    resetSensitiveMatcherForTests(["违禁样例词", "出售雷管"]);
    expect(containsSensitiveContent("今天食堂炒面还不错")).toBe(false);
    expect(() => assertNoSensitiveContent("还有位子吗")).not.toThrow();
  });

  it("blocks lexicon hits and throws SENSITIVE_CONTENT", () => {
    resetSensitiveMatcherForTests(["违禁样例词"]);
    expect(containsSensitiveContent("前面违禁样例词后面")).toBe(true);
    expect(() => assertNoSensitiveContent("前面违禁样例词后面")).toThrow(
      "SENSITIVE_CONTENT",
    );
  });

  it("matches numeric terms only outside longer digit sequences", () => {
    resetSensitiveMatcherForTests(["65"]);
    expect(containsSensitiveContent("事件65回顾")).toBe(true);
    expect(containsSensitiveContent("E2E静态-1784133300658")).toBe(false);
    expect(containsSensitiveContent("电话96512345")).toBe(false);
  });

  it("loads the vendored lexicon and catches a known guns-list term", () => {
    resetSensitiveMatcherForTests(null);
    const sample = readFileSync(
      join(process.cwd(), "src/data/sensitive-words-guns.txt"),
      "utf8",
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((word) => word.length >= 2);
    expect(sample).toBeTruthy();
    expect(containsSensitiveContent(`前缀${sample}后缀`)).toBe(true);
    expect(containsSensitiveContent("期末食堂加油")).toBe(false);
  });
});
