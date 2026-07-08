import { describe, it, expect } from "vitest";
import { validateCommentContent } from "@/lib/canteen-types";

describe("validateCommentContent", () => {
  it("accepts trimmed plain text within limit", () => {
    expect(validateCommentContent("  味道不错  ")).toBe("味道不错");
  });

  it("rejects empty content", () => {
    expect(() => validateCommentContent("   ")).toThrow("INVALID_COMMENT");
  });

  it("rejects HTML tags to prevent stored XSS", () => {
    expect(() => validateCommentContent("<script>alert(1)</script>")).toThrow(
      "INVALID_COMMENT",
    );
    expect(() => validateCommentContent("好吃<b>极了</b>")).toThrow(
      "INVALID_COMMENT",
    );
  });

  it("rejects content over 500 characters", () => {
    expect(() => validateCommentContent("a".repeat(501))).toThrow(
      "INVALID_COMMENT",
    );
  });
});
