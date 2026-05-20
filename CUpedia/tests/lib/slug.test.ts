import { describe, it, expect } from "vitest";
import { generateSlug, validateSlug } from "@/lib/slug";

describe("generateSlug", () => {
  it("keeps Chinese characters as-is", () => {
    expect(generateSlug("八达通")).toBe("八达通");
  });

  it("lowercases English words and joins with dash", () => {
    expect(generateSlug("WiFi Setup")).toBe("wifi-setup");
  });

  it("handles mixed Chinese and English", () => {
    expect(generateSlug("校园WiFi指南")).toBe("校园-wifi-指南");
  });

  it("handles parentheses and special chars by stripping", () => {
    expect(generateSlug("入学准备（必读）")).toBe("入学准备-必读");
  });

  it("collapses consecutive dashes", () => {
    expect(generateSlug("A - B")).toBe("a-b");
  });

  it("strips leading and trailing dashes", () => {
    expect(generateSlug("  hello  ")).toBe("hello");
  });
});

describe("validateSlug", () => {
  it("accepts pure Chinese slug", () => {
    expect(validateSlug("八达通")).toBe(true);
  });

  it("accepts pure English slug", () => {
    expect(validateSlug("hello-world")).toBe(true);
  });

  it("accepts nested Chinese slug", () => {
    expect(validateSlug("入学准备/生活物品")).toBe(true);
  });

  it("accepts mixed Chinese-English slug", () => {
    expect(validateSlug("校园-wifi-指南")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateSlug("")).toBe(false);
  });

  it("rejects slugs with spaces", () => {
    expect(validateSlug("hello world")).toBe(false);
  });

  it("rejects reserved app route prefixes", () => {
    expect(validateSlug("edit/octopus")).toBe(false);
    expect(validateSlug("history/octopus")).toBe(false);
    expect(validateSlug("new")).toBe(false);
    expect(validateSlug("search/results")).toBe(false);
  });

  it("rejects slugs with consecutive slashes", () => {
    expect(validateSlug("a//b")).toBe(false);
  });

  it("rejects slugs starting or ending with slash", () => {
    expect(validateSlug("/hello")).toBe(false);
    expect(validateSlug("hello/")).toBe(false);
  });
});
