import { describe, expect, it } from "vitest";

import { mergeMarkdown, threeWayMergeContent } from "@/lib/merge-content";

const para = (text: string) => ({ type: "p", children: [{ text }] });
const doc = (...texts: string[]) => JSON.stringify(texts.map(para));

describe("mergeMarkdown", () => {
  it("auto-merges non-overlapping changes", () => {
    const base = "line1\nline2\nline3\nline4";
    const mine = "line1-MINE\nline2\nline3\nline4";
    const theirs = "line1\nline2\nline3\nline4-THEIRS";

    const result = mergeMarkdown({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(result.merged).toBe("line1-MINE\nline2\nline3\nline4-THEIRS");
  });

  it("flags a conflict when both sides change the same line", () => {
    const base = "line1\nline2\nline3";
    const mine = "lineX\nline2\nline3";
    const theirs = "lineY\nline2\nline3";

    const result = mergeMarkdown({ base, mine, theirs });

    expect(result.clean).toBe(false);
  });

  it("treats identical changes on both sides as clean", () => {
    const base = "a\nb\nc";
    const mine = "a\nB\nc";
    const theirs = "a\nB\nc";

    const result = mergeMarkdown({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(result.merged).toBe("a\nB\nc");
  });

  it("is clean when only one side changed", () => {
    const base = "a\nb\nc";
    const mine = "a\nb\nc";
    const theirs = "a\nb\nc\nd";

    const result = mergeMarkdown({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(result.merged).toBe("a\nb\nc\nd");
  });
});

describe("threeWayMergeContent", () => {
  it("auto-merges non-overlapping block edits", async () => {
    const base = doc("alpha", "bravo", "charlie");
    const mine = doc("alpha edited", "bravo", "charlie");
    const theirs = doc("alpha", "bravo", "charlie edited");

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).toContain("alpha edited");
    expect(text).toContain("charlie edited");
  });

  it("falls back when both sides edit the same block", async () => {
    const base = doc("alpha", "bravo", "charlie");
    const mine = doc("alpha mine", "bravo", "charlie");
    const theirs = doc("alpha theirs", "bravo", "charlie");

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(false);
    expect(result.content).toBeUndefined();
  });
});
