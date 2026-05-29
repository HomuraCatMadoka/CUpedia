import { describe, it, expect } from "vitest";
import { commentLeafId } from "@/lib/comment-leaf-id";

describe("commentLeafId", () => {
  it("returns the last comment id from an inline comment node", () => {
    expect(
      commentLeafId({ text: "x", comment: true, comment_abc: true } as never),
    ).toBe("abc");
  });

  it("returns the last id when a node carries multiple comment marks", () => {
    expect(
      commentLeafId({
        text: "x",
        comment: true,
        comment_abc: true,
        comment_def: true,
      } as never),
    ).toBe("def");
  });

  it("returns null for a node without comment marks", () => {
    expect(commentLeafId({ text: "x" } as never)).toBeNull();
  });

  it("returns null for a nullish node", () => {
    expect(commentLeafId(null)).toBeNull();
    expect(commentLeafId(undefined)).toBeNull();
  });
});
