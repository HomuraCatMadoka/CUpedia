import { describe, expect, it } from "vitest";

import {
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

  it("clears every fully acknowledged local recovery record", () => {
    expect(resolveAcknowledgedWikiDraft(record, "local edit")).toBeNull();
    const nextBase = {
      version: 5,
      contentGeneration: 2,
      snapshot: "local edit",
    };
    expect(
      resolveAcknowledgedWikiDraft(record, "local edit", nextBase),
    ).toBeNull();
    expect(
      resolveAcknowledgedWikiDraft(
        {
          ...record,
          submittedSnapshot: "local edit",
          draftSnapshot: "trailing edit",
        },
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
