import { describe, expect, it } from "vitest";

import { serializeContentWithoutDraftComments } from "@/components/wiki/discussion-draft";

describe("serializeContentWithoutDraftComments", () => {
  it("removes draft-only comment marks before persistence", () => {
    const serialized = serializeContentWithoutDraftComments([
      {
        type: "p",
        children: [
          {
            text: "Draft selection",
            comment: true,
            comment_draft: true,
          },
        ],
      },
    ]);

    expect(JSON.parse(serialized)).toEqual([
      {
        type: "p",
        children: [{ text: "Draft selection" }],
      },
    ]);
  });

  it("preserves the base mark when a draft overlaps an existing comment", () => {
    const serialized = serializeContentWithoutDraftComments([
      {
        type: "p",
        children: [
          {
            text: "Shared selection",
            comment: true,
            comment_draft: true,
            comment_existing: true,
          },
        ],
      },
    ]);

    expect(JSON.parse(serialized)).toEqual([
      {
        type: "p",
        children: [
          {
            text: "Shared selection",
            comment: true,
            comment_existing: true,
          },
        ],
      },
    ]);
  });
});
