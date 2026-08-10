import { describe, expect, it } from "vitest";

import {
  shouldAdoptWikiSyncRevision,
  type WikiSyncRevision,
} from "@/lib/wiki-sync";

const revision: WikiSyncRevision = {
  documentKind: "page",
  userId: "user-1",
  pageId: "page-1",
  version: 5,
  contentGeneration: 2,
  updatedAt: "2026-01-01T00:00:00.000Z",
  snapshot: "server-v5",
};

describe("shouldAdoptWikiSyncRevision", () => {
  it("adopts a newer clean revision for the same document", () => {
    expect(
      shouldAdoptWikiSyncRevision(
        {
          documentKind: "page",
          userId: "user-1",
          pageId: "page-1",
          version: 4,
          dirty: false,
        },
        revision,
      ),
    ).toBe(true);
  });

  it.each([
    ["dirty editor", { dirty: true }],
    ["same version", { version: 5 }],
    ["older version", { version: 6 }],
    ["other Page", { pageId: "page-2" }],
    ["other User", { userId: "user-2" }],
    ["public/private mismatch", { documentKind: "draft" as const }],
  ])("rejects a revision for a %s", (_label, override) => {
    expect(
      shouldAdoptWikiSyncRevision(
        {
          documentKind: "page",
          userId: "user-1",
          pageId: "page-1",
          version: 4,
          dirty: false,
          ...override,
        },
        revision,
      ),
    ).toBe(false);
  });
});
