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

  it("auto-merges consecutive formatting changes in the same paragraph", async () => {
    const base = doc(para("香港实习 NOL 经验分享"));
    const theirs = doc({
      type: "p",
      children: [
        { text: "香港实习 " },
        { text: "NOL", bold: true },
        { text: " 经验分享" },
      ],
    });
    const mine = doc({
      type: "p",
      children: [
        { text: "香港实习 " },
        { text: "NOL", bold: true },
        { text: " " },
        { text: "经验分享", italic: true },
      ],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual(JSON.parse(mine));
  });

  it("auto-merges a remote text edit with local formatting elsewhere", async () => {
    const base = doc(para("香港实习 NOL 经验分享"));
    const theirs = doc(para("暑期实习 NOL 经验分享"));
    const mine = doc({
      type: "p",
      children: [
        { text: "香港实习 " },
        { text: "NOL", bold: true },
        { text: " 经验分享" },
      ],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      {
        type: "p",
        children: [
          { text: "暑期实习 " },
          { text: "NOL", bold: true },
          { text: " 经验分享" },
        ],
      },
    ]);
  });

  it("auto-merges a remote heading change with local inline formatting", async () => {
    const base = doc(para("经验分享"));
    const theirs = doc({ type: "h2", children: [{ text: "经验分享" }] });
    const mine = doc({
      type: "p",
      children: [{ text: "经验分享", bold: true }],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      { type: "h2", children: [{ text: "经验分享", bold: true }] },
    ]);
  });

  it("preserves Chinese text and a joined emoji across formatting merges", async () => {
    const family = "👨‍👩‍👧‍👦";
    const base = doc(para(`${family} 香港实习`));
    const theirs = doc({
      type: "p",
      children: [{ text: family, bold: true }, { text: " 香港实习" }],
    });
    const mine = doc({
      type: "p",
      children: [
        { text: `${family} ` },
        { text: "香港", italic: true },
        { text: "实习" },
      ],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      {
        type: "p",
        children: [
          { text: family, bold: true },
          { text: " " },
          { text: "香港", italic: true },
          { text: "实习" },
        ],
      },
    ]);
  });

  it("does not combine concurrent edits inside one Unicode grapheme", async () => {
    const base = doc(para("e\u0301"));
    const mine = doc(para("a\u0301"));
    const theirs = doc(para("e\u0300"));

    await expect(threeWayMergeContent({ base, mine, theirs })).resolves.toEqual(
      { clean: false },
    );
  });

  it("combines compatible formatting applied to the same text", async () => {
    const base = doc(para("NOL"));
    const theirs = doc({
      type: "p",
      children: [{ text: "NOL", italic: true }],
    });
    const mine = doc({
      type: "p",
      children: [{ text: "NOL", bold: true }],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      {
        type: "p",
        children: [{ text: "NOL", bold: true, italic: true }],
      },
    ]);
  });

  it("merges removing one style with adding another style", async () => {
    const base = doc({
      type: "p",
      children: [{ text: "NOL", bold: true }],
    });
    const theirs = doc(para("NOL"));
    const mine = doc({
      type: "p",
      children: [{ text: "NOL", bold: true, italic: true }],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      { type: "p", children: [{ text: "NOL", italic: true }] },
    ]);
  });

  it("keeps a conflict when the same formatting property diverges", async () => {
    const base = doc(para("NOL"));
    const theirs = doc({
      type: "p",
      children: [{ text: "NOL", color: "#0000ff" }],
    });
    const mine = doc({
      type: "p",
      children: [{ text: "NOL", color: "#ff0000" }],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result).toEqual({ clean: false });
  });

  it("keeps a valid empty text leaf while merging empty-block formatting", async () => {
    const base = doc(para(""));
    const theirs = doc({ type: "h2", children: [{ text: "" }] });
    const mine = doc({
      type: "p",
      align: "center",
      children: [{ text: "" }],
    });

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      {
        type: "h2",
        align: "center",
        children: [{ text: "" }],
      },
    ]);
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

  it("preserves distinct node ids for repeated blocks in a clean merge", async () => {
    const withId = (text: string, id: string) => ({
      type: "p",
      id,
      children: [{ text }],
    });
    const base = doc(
      withId("same", "base-a"),
      withId("same", "base-b"),
      withId("tail", "base-c"),
    );
    const mine = doc(
      withId("same", "mine-a"),
      withId("same", "mine-b"),
      withId("tail local", "mine-c"),
    );
    const theirs = doc(
      withId("same", "their-a"),
      withId("same", "their-b"),
      withId("tail", "their-c"),
    );

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(
      (JSON.parse(result.content!) as { id: string }[]).map(
        (block) => block.id,
      ),
    ).toEqual(["mine-a", "mine-b", "mine-c"]);
  });

  it("merges formatting applied to different repeated paragraphs", async () => {
    const block = (id: string, marks: Record<string, boolean> = {}) => ({
      id,
      type: "p",
      children: [{ text: "same", ...marks }],
    });
    const base = doc(block("a"), block("b"));
    const mine = doc(block("a", { bold: true }), block("b"));
    const theirs = doc(block("a"), block("b", { italic: true }));

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      block("a", { bold: true }),
      block("b", { italic: true }),
    ]);
  });

  it("uses block identity when one repeated paragraph is deleted and the other is formatted", async () => {
    const block = (id: string, marks: Record<string, boolean> = {}) => ({
      id,
      type: "p",
      children: [{ text: "same", ...marks }],
    });
    const base = doc(block("a"), block("b"));
    const mine = doc(block("b", { bold: true }));
    const theirs = doc(block("b"));

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([block("b", { bold: true })]);
  });

  it("keeps a repeated-block insertion distinct from formatting an existing copy", async () => {
    const block = (id: string, marks: Record<string, boolean> = {}) => ({
      id,
      type: "p",
      children: [{ text: "same", ...marks }],
    });
    const base = doc(block("a"), block("b"));
    const mine = doc(block("new"), block("a"), block("b"));
    const theirs = doc(block("a"), block("b", { italic: true }));

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result.clean).toBe(true);
    expect(JSON.parse(result.content!)).toEqual([
      block("new"),
      block("a"),
      block("b", { italic: true }),
    ]);
  });

  it("does not auto-merge deleting and formatting the same repeated block", async () => {
    const block = (id: string, marks: Record<string, boolean> = {}) => ({
      id,
      type: "p",
      children: [{ text: "same", ...marks }],
    });
    const base = doc(block("a"), block("b"));
    const mine = doc(block("b"));
    const theirs = doc(block("a", { bold: true }), block("b"));

    await expect(threeWayMergeContent({ base, mine, theirs })).resolves.toEqual(
      { clean: false },
    );
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

  it("does not leaf-merge independent edits inside an equation block", async () => {
    const mineEquation = { ...EQUATION, texExpression: "x + 1" };
    const theirEquation = { ...EQUATION, align: "center" };
    const base = doc(EQUATION);
    const mine = doc(mineEquation);
    const theirs = doc(theirEquation);

    const result = await threeWayMergeContent({ base, mine, theirs });

    expect(result).toEqual({ clean: false });
  });
});
