import { describe, expect, it } from "vitest";

import {
  parseWikiEditSnapshot,
  sameWikiPageSnapshot,
  serializeWikiEditSnapshot,
  tryParseWikiEditSnapshot,
} from "@/lib/wiki-edit-snapshot";

const snapshot = {
  title: "香港实习",
  icon: "📚",
  content: JSON.stringify([
    { type: "p", children: [{ text: "NOL", bold: true }] },
  ]),
  parentId: "00000000-0000-4000-a000-000000000001",
  editSummary: "调整排版",
};

describe("wiki edit snapshot codec", () => {
  it("round-trips the complete editor snapshot", () => {
    expect(parseWikiEditSnapshot(serializeWikiEditSnapshot(snapshot))).toEqual(
      snapshot,
    );
  });

  it("normalizes legacy snapshots without an edit summary", () => {
    const legacy = {
      title: snapshot.title,
      icon: snapshot.icon,
      content: snapshot.content,
      parentId: snapshot.parentId,
    };
    expect(parseWikiEditSnapshot(JSON.stringify(legacy))).toEqual({
      ...legacy,
      editSummary: "",
    });
  });

  it("rejects malformed field types instead of trusting JSON.parse casts", () => {
    expect(
      tryParseWikiEditSnapshot(JSON.stringify({ ...snapshot, parentId: 42 })),
    ).toBeNull();
  });

  it("compares page state independently from session-only edit summaries", () => {
    const left = serializeWikiEditSnapshot(snapshot);
    const right = serializeWikiEditSnapshot({
      ...snapshot,
      editSummary: "另一个摘要",
    });

    expect(sameWikiPageSnapshot(left, right)).toBe(true);
  });
});
