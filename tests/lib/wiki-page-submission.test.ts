import { describe, expect, it } from "vitest";

import { fingerprintWikiPageSubmission } from "@/lib/wiki-page-submission";

const BASE_SUBMISSION = {
  pageId: "00000000-0000-4000-8000-000000000001",
  title: "Submitted title",
  icon: null,
  content: "submitted content",
  editSummary: "submitted summary",
  parentId: null,
  baseTitle: "Base title",
  baseIcon: null,
  baseContent: "base content",
  baseParentId: null,
};

describe("fingerprintWikiPageSubmission", () => {
  it("is stable for the same immutable submission payload", () => {
    expect(fingerprintWikiPageSubmission(BASE_SUBMISSION)).toBe(
      fingerprintWikiPageSubmission({ ...BASE_SUBMISSION }),
    );
  });

  it.each([
    ["title", { title: "Different title" }],
    ["content", { content: "different content" }],
    ["summary", { editSummary: "different summary" }],
    ["parent", { parentId: undefined }],
    ["merge base", { baseContent: "different base" }],
    ["editor projection", { hiddenChildPageIds: ["child-a"] }],
  ])("changes when the %s changes", (_field, change) => {
    expect(
      fingerprintWikiPageSubmission({ ...BASE_SUBMISSION, ...change }),
    ).not.toBe(fingerprintWikiPageSubmission(BASE_SUBMISSION));
  });

  it("treats the hidden child ids as a canonical set", () => {
    expect(
      fingerprintWikiPageSubmission({
        ...BASE_SUBMISSION,
        hiddenChildPageIds: ["child-b", "child-a", "child-b"],
      }),
    ).toBe(
      fingerprintWikiPageSubmission({
        ...BASE_SUBMISSION,
        hiddenChildPageIds: ["child-a", "child-b"],
      }),
    );
  });
});
