import { describe, expect, it } from "vitest";

import {
  classifyWikiDraft,
  createWikiDraftKey,
  resolveAcknowledgedWikiDraft,
  formatWikiContentForDiff,
  type WikiDraftRecord,
} from "@/lib/wiki-draft";

const record: WikiDraftRecord = {
  schemaVersion: 1,
  userId: "user-1",
  pageId: "page-1",
  sessionId: "tab-1",
  baseVersion: 4,
  contentGeneration: 2,
  baseSnapshot: "server-v4",
  draftSnapshot: "local edit",
  updatedAt: 100,
};

describe("wiki draft recovery state", () => {
  it("keys drafts by user, page, and editing session", () => {
    expect(createWikiDraftKey(record)).toBe("user-1:page-1:tab-1");
    expect(createWikiDraftKey({ ...record, sessionId: "tab-2" })).not.toBe(
      createWikiDraftKey(record),
    );
  });

  it("offers an unsent draft when the server still matches its generation", () => {
    expect(
      classifyWikiDraft(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 4,
        contentGeneration: 2,
        snapshot: "server-v4",
      }),
    ).toBe("recoverable");
  });

  it("does not show a false prompt for content already acknowledged by the server", () => {
    expect(
      classifyWikiDraft(
        { ...record, draftSnapshot: "server-v5" },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 5,
          contentGeneration: 2,
          snapshot: "server-v5",
        },
      ),
    ).toBe("none");
  });

  it("marks an older-generation draft as stale after rollback", () => {
    expect(
      classifyWikiDraft(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 5,
        contentGeneration: 3,
        snapshot: "rolled back",
      }),
    ).toBe("stale-generation");
  });

  it("clears only the exact draft snapshot acknowledged by a save", () => {
    expect(resolveAcknowledgedWikiDraft(record, "local edit")).toBeNull();
    expect(
      resolveAcknowledgedWikiDraft(
        { ...record, draftSnapshot: "trailing edit" },
        "local edit",
        {
          version: 5,
          contentGeneration: 2,
          snapshot: "server-v5",
        },
      ),
    ).toEqual({
      ...record,
      baseVersion: 5,
      baseSnapshot: "server-v5",
      draftSnapshot: "trailing edit",
    });
  });

  it("keeps formatting and block structure visible in the recovery diff", () => {
    expect(
      formatWikiContentForDiff(
        JSON.stringify([
          {
            type: "h2",
            children: [{ text: "Heading", bold: true }],
          },
          {
            type: "blockquote",
            children: [{ text: "Quoted", italic: true }],
          },
        ]),
      ),
    ).toBe("## **Heading**\n\n> _Quoted_");
  });
});
