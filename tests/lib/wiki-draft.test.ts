import { describe, expect, it } from "vitest";

import {
  createWikiDraftKey,
  formatWikiContentForDiff,
  type WikiDraftRecord,
} from "@/lib/wiki-draft";

const record: WikiDraftRecord = {
  schemaVersion: 2,
  userId: "user-1",
  pageId: "page-1",
  documentKind: "page",
  sessionId: "tab-1",
  baseVersion: 4,
  contentGeneration: 2,
  baseSnapshot: "server-v4",
  draftSnapshot: "local edit",
  updatedAt: 100,
};

describe("wiki draft recovery state", () => {
  it("keys drafts by user, page, and editing session", () => {
    expect(createWikiDraftKey(record)).toBe("user-1:page:page-1:tab-1");
    expect(createWikiDraftKey({ ...record, sessionId: "tab-2" })).not.toBe(
      createWikiDraftKey(record),
    );
  });

  it("keeps private-draft recovery separate from the published page", () => {
    expect(createWikiDraftKey({ ...record, documentKind: "draft" })).not.toBe(
      createWikiDraftKey({ ...record, documentKind: "page" }),
    );
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
