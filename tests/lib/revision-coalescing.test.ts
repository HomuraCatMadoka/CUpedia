import { describe, it, expect } from "vitest";
import {
  shouldCoalesceRevision,
  REVISION_COALESCE_WINDOW_MS,
  CREATE_REVISION_SUMMARY,
  ROLLBACK_REVISION_SUMMARY_PREFIX,
} from "@/lib/revision-coalescing";

// ref ADR 0009 — write-side revision coalescing. A run of same-author edits
// inside a 5-min sliding idle window collapses into one revision; a change of
// author, an idle gap past the window, or a system checkpoint (page creation /
// rollback) opens a fresh revision instead.
describe("shouldCoalesceRevision", () => {
  const base = new Date("2026-07-07T12:00:00Z");
  const withinWindow = new Date(base.getTime() + 60_000); // +1 min
  const atBoundary = new Date(base.getTime() + REVISION_COALESCE_WINDOW_MS);
  const pastWindow = new Date(base.getTime() + REVISION_COALESCE_WINDOW_MS + 1);

  const prevEdit = (
    over: Partial<{
      editedBy: string;
      createdAt: Date;
      editSummary: string | null;
    }> = {},
  ) => ({
    editedBy: "user-1",
    createdAt: base,
    editSummary: null as string | null,
    ...over,
  });

  it("does not coalesce when there is no previous revision", () => {
    expect(
      shouldCoalesceRevision(null, { userId: "user-1", at: withinWindow }),
    ).toBe(false);
    expect(
      shouldCoalesceRevision(undefined, { userId: "user-1", at: withinWindow }),
    ).toBe(false);
  });

  it("coalesces a same-author edit inside the window", () => {
    expect(
      shouldCoalesceRevision(prevEdit(), {
        userId: "user-1",
        at: withinWindow,
      }),
    ).toBe(true);
  });

  it("coalesces regardless of a user-authored edit summary", () => {
    expect(
      shouldCoalesceRevision(prevEdit({ editSummary: "补充细节" }), {
        userId: "user-1",
        at: withinWindow,
      }),
    ).toBe(true);
  });

  it("does not coalesce a different author (opens a new revision)", () => {
    expect(
      shouldCoalesceRevision(prevEdit(), {
        userId: "user-2",
        at: withinWindow,
      }),
    ).toBe(false);
  });

  it("coalesces exactly at the window boundary but not past it", () => {
    expect(
      shouldCoalesceRevision(prevEdit(), { userId: "user-1", at: atBoundary }),
    ).toBe(true);
    expect(
      shouldCoalesceRevision(prevEdit(), { userId: "user-1", at: pastWindow }),
    ).toBe(false);
  });

  it("never coalesces into a rollback checkpoint, even for the same author in-window", () => {
    expect(
      shouldCoalesceRevision(
        prevEdit({ editSummary: `${ROLLBACK_REVISION_SUMMARY_PREFIX}rev-abc` }),
        { userId: "user-1", at: withinWindow },
      ),
    ).toBe(false);
  });

  it("never coalesces into a page-creation checkpoint", () => {
    expect(
      shouldCoalesceRevision(
        prevEdit({ editSummary: CREATE_REVISION_SUMMARY }),
        {
          userId: "user-1",
          at: withinWindow,
        },
      ),
    ).toBe(false);
  });
});
