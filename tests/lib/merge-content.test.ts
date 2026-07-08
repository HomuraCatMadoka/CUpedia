import { describe, expect, it } from "vitest";

import { threeWayMergeContent } from "@/lib/merge-content";

// ref ADR 0008 — three-way merge runs node-diff3 over canonicalized top-level
// Plate blocks, never lowering to markdown. The old markdown bridge was lossy
// (callout → blockquote, equation/toc dropped) and heavy (4× headless Plate);
// these tests pin the fidelity the bridge could not give.

const para = (text: string) => ({ type: "p", children: [{ text }] });
const doc = (...blocks: unknown[]) => JSON.stringify(blocks);
const paras = (...texts: string[]) => doc(...texts.map(para));

const CALLOUT = {
  type: "callout",
  variant: "info",
  children: [{ type: "p", children: [{ text: "maintained by students" }] }],
};
const EQUATION = {
  type: "equation",
  texExpression: "\\int_0^1 x^2 \\, dx = \\tfrac{1}{3}",
  children: [{ text: "" }],
};
const TOC = { type: "toc", children: [{ text: "" }] };

describe("threeWayMergeContent", () => {
  it("auto-merges non-overlapping block edits", async () => {
    const base = paras("alpha", "bravo", "charlie");
    const mine = paras("alpha edited", "bravo", "charlie");
    const theirs = paras("alpha", "bravo", "charlie edited");

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).toContain("alpha edited");
    expect(text).toContain("charlie edited");
  });

  it("auto-merges edits to two adjacent but distinct blocks", async () => {
    // No unchanged block sits between the two edits; a separator woven between
    // block keys gives diff3 the context to merge them instead of conflicting.
    const base = paras("alpha", "bravo", "charlie", "delta");
    const mine = paras("alpha", "BRAVO", "charlie", "delta");
    const theirs = paras("alpha", "bravo", "CHARLIE", "delta");

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      para("alpha"),
      para("BRAVO"),
      para("CHARLIE"),
      para("delta"),
    ]);
  });

  it("falls back when both sides edit the same block", async () => {
    const base = paras("alpha", "bravo", "charlie");
    const mine = paras("alpha mine", "bravo", "charlie");
    const theirs = paras("alpha theirs", "bravo", "charlie");

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(false);
    expect(result.content).toBeUndefined();
  });

  it("treats an identical edit on both sides as a clean, non-conflicting merge", async () => {
    const base = paras("alpha", "bravo", "charlie");
    const mine = paras("alpha", "BRAVO", "charlie");
    const theirs = paras("alpha", "BRAVO", "charlie");

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    const merged = JSON.parse(result.content!) as unknown[];
    expect(merged).toContainEqual(para("BRAVO"));
  });

  it("preserves a callout block byte-for-byte through a non-adjacent clean merge", async () => {
    const base = doc(para("intro"), CALLOUT, para("outro"));
    const mine = doc(para("intro edited"), CALLOUT, para("outro"));
    const theirs = doc(para("intro"), CALLOUT, para("outro edited"));

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    const merged = JSON.parse(result.content!) as unknown[];
    // The callout survives intact — not downgraded to a blockquote with a
    // literal "[!NOTE]" body the way the markdown bridge corrupted it.
    expect(merged).toContainEqual(CALLOUT);
    expect(JSON.stringify(result.content)).not.toContain("blockquote");
  });

  it("preserves equation and toc blocks through a clean merge", async () => {
    const base = doc(para("head"), EQUATION, TOC, para("tail"));
    const mine = doc(para("head edited"), EQUATION, TOC, para("tail"));
    const theirs = doc(para("head"), EQUATION, TOC, para("tail edited"));

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    const merged = JSON.parse(result.content!) as unknown[];
    expect(merged).toContainEqual(EQUATION);
    expect(merged).toContainEqual(TOC);
  });

  it("ignores volatile per-node ids when matching blocks (no false conflict)", async () => {
    // A NodeId plugin would stamp a different `id` on each side's copy of the
    // same block. Canonicalization must strip `id` so the unchanged first
    // block does not read as a conflicting edit on both sides.
    const withId = (text: string, id: string) => ({
      type: "p",
      id,
      children: [{ text }],
    });
    const base = doc(withId("keep", "a"));
    const mine = doc(withId("keep", "b"), para("mine add"));
    const theirs = doc(withId("keep", "c"));

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).toContain("keep");
    expect(text).toContain("mine add");
  });

  it("detects a conflict when both sides edit the same rich block", async () => {
    const mineCallout = { ...CALLOUT, variant: "warning" };
    const theirCallout = { ...CALLOUT, variant: "danger" };
    const base = doc(para("head"), CALLOUT);
    const mine = doc(para("head"), mineCallout);
    const theirs = doc(para("head"), theirCallout);

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(false);
    expect(result.content).toBeUndefined();
  });
});
