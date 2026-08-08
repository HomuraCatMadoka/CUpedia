import { describe, expect, it } from "vitest";

import {
  restoreWikiEditSession,
  shouldAdvanceWikiEditBaseline,
} from "@/lib/wiki-edit-session";
import type { WikiDraftRecord } from "@/lib/wiki-draft";

function snapshot(title: string, editSummary: string) {
  return JSON.stringify({
    title,
    icon: null,
    content: JSON.stringify([{ type: "p", children: [{ text: title }] }]),
    parentId: null,
    editSummary,
  });
}

describe("Wiki edit session recovery", () => {
  it("advances the baseline when the server confirms the submitted Page despite trailing edits", () => {
    expect(
      shouldAdvanceWikiEditBaseline({
        draftMode: false,
        submittedSnapshot: snapshot("submitted-v5", "session summary"),
        authoritativeSnapshot: snapshot("submitted-v5", ""),
        localSnapshot: snapshot("trailing-v6", "session summary"),
      }),
    ).toBe(true);
  });

  it("keeps the old baseline when server and submitted Pages differ during trailing edits", () => {
    expect(
      shouldAdvanceWikiEditBaseline({
        draftMode: false,
        submittedSnapshot: snapshot("submitted-v5", ""),
        authoritativeSnapshot: snapshot("merged-with-other-writer-v5", ""),
        localSnapshot: snapshot("trailing-v6", ""),
      }),
    ).toBe(false);
  });

  it("resumes a trailing Local draft when only write metadata differs from the server Page", () => {
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 5,
      contentGeneration: 2,
      baseSnapshot: snapshot("confirmed", "session summary"),
      draftSnapshot: snapshot("trailing", "session summary"),
      updatedAt: 1,
    };

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 5,
        contentGeneration: 2,
        snapshot: snapshot("confirmed", ""),
      }),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 5,
        contentGeneration: 2,
        snapshot: snapshot("confirmed", ""),
      },
      localSnapshot: snapshot("trailing", "session summary"),
    });
  });

  it("rebases a Local draft when only the server version advanced", () => {
    const base = snapshot("unchanged-page", "");
    const local = snapshot("local-edit", "");

    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: base,
          draftSnapshot: local,
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 5,
          contentGeneration: 2,
          snapshot: base,
        },
      ),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 5,
        contentGeneration: 2,
        snapshot: base,
      },
      localSnapshot: local,
    });
  });

  it("resumes a trailing Local draft from an acknowledged baseline ahead of a stale route", () => {
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 6,
      contentGeneration: 2,
      baseSnapshot: snapshot("confirmed-v6", ""),
      draftSnapshot: snapshot("trailing-v7", ""),
      updatedAt: 1,
    };

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 5,
        contentGeneration: 2,
        snapshot: snapshot("stale-route-v5", ""),
      }),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 6,
        contentGeneration: 2,
        snapshot: snapshot("confirmed-v6", ""),
      },
      localSnapshot: snapshot("trailing-v7", ""),
    });
  });

  it("recognizes a submitted write already present on the server Page", () => {
    const submitted = snapshot("submitted-v5", "session summary");
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: snapshot("base-v4", ""),
      submittedSnapshot: submitted,
      draftSnapshot: snapshot("trailing-v6", "session summary"),
      updatedAt: 1,
    };

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 5,
        contentGeneration: 2,
        snapshot: snapshot("submitted-v5", ""),
      }),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 5,
        contentGeneration: 2,
        snapshot: snapshot("submitted-v5", ""),
      },
      localSnapshot: snapshot("trailing-v6", "session summary"),
    });
  });

  it("replays the exact pending write before a trailing Local draft", () => {
    const submitted = snapshot("submitted-v5", "session summary");
    const base = snapshot("base-v4", "");
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: base,
      submittedSnapshot: submitted,
      draftSnapshot: snapshot("trailing-v6", "session summary"),
      updatedAt: 1,
    };

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 4,
        contentGeneration: 2,
        snapshot: base,
      }),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 4,
        contentGeneration: 2,
        snapshot: base,
      },
      pendingSnapshot: submitted,
      localSnapshot: snapshot("trailing-v6", "session summary"),
    });
  });

  it("does not treat an equal-version summary-only request as acknowledged", () => {
    const base = snapshot("unchanged-page-v4", "");
    const submitted = snapshot("unchanged-page-v4", "attempted summary");
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: base,
      submittedSnapshot: submitted,
      draftSnapshot: submitted,
      updatedAt: 1,
    };

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 4,
        contentGeneration: 2,
        snapshot: base,
      }),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 4,
        contentGeneration: 2,
        snapshot: base,
      },
      pendingSnapshot: submitted,
      localSnapshot: submitted,
    });
  });

  it("retains a trailing summary after the submitted Page reaches the server", () => {
    const submitted = snapshot("unchanged-page-v5", "first summary");
    const trailing = snapshot("unchanged-page-v5", "trailing summary");
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: snapshot("base-v4", ""),
      submittedSnapshot: submitted,
      draftSnapshot: trailing,
      updatedAt: 1,
    };

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        version: 5,
        contentGeneration: 2,
        snapshot: snapshot("unchanged-page-v5", ""),
      }),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 5,
        contentGeneration: 2,
        snapshot: snapshot("unchanged-page-v5", ""),
      },
      localSnapshot: trailing,
    });
  });

  it("discards a Local draft when its Page state is already on the server", () => {
    const base = snapshot("base-v4", "");
    const confirmed = snapshot("confirmed-v5", "session summary");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: base,
          submittedSnapshot: confirmed,
          draftSnapshot: confirmed,
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 5,
          contentGeneration: 2,
          snapshot: snapshot("confirmed-v5", ""),
        },
      ),
    ).toEqual({ kind: "discard" });
  });

  it("requires manual recovery after the server changes content generation", () => {
    const base = snapshot("base-v4", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: base,
          draftSnapshot: snapshot("local-v5", ""),
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 5,
          contentGeneration: 3,
          snapshot: snapshot("rolled-back", ""),
        },
      ),
    ).toEqual({ kind: "manual", reason: "stale-generation" });
  });

  it("requires manual recovery when another write changed the same generation", () => {
    const base = snapshot("base-v4", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: base,
          draftSnapshot: snapshot("mine-v5", ""),
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 5,
          contentGeneration: 2,
          snapshot: snapshot("theirs-v5", ""),
        },
      ),
    ).toEqual({ kind: "manual", reason: "server-changed" });
  });

  it("never auto-resumes a conflict draft retained for manual recovery", () => {
    const server = snapshot("server-v5", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 5,
          contentGeneration: 2,
          baseSnapshot: server,
          draftSnapshot: snapshot("rejected-local-v5", ""),
          recoveryDisposition: "manual",
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 5,
          contentGeneration: 2,
          snapshot: server,
        },
      ),
    ).toEqual({ kind: "manual", reason: "server-changed" });
  });

  it("resumes edits made while a blank Page is initialized from version zero", () => {
    const blank = snapshot("", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 0,
          contentGeneration: 0,
          baseSnapshot: blank,
          draftSnapshot: snapshot("typed during initialization", ""),
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 1,
          contentGeneration: 0,
          snapshot: blank,
        },
      ),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 1,
        contentGeneration: 0,
        snapshot: blank,
      },
      localSnapshot: snapshot("typed during initialization", ""),
    });
  });

  it("discards an unchanged Local draft with no pending write", () => {
    const server = snapshot("server-v4", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: server,
          draftSnapshot: server,
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 4,
          contentGeneration: 2,
          snapshot: server,
        },
      ),
    ).toEqual({ kind: "discard" });
  });

  it("replays a pending write before a trailing undo to the server baseline", () => {
    const base = snapshot("base-v4", "");
    const submitted = snapshot("submitted-v5", "session summary");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: base,
          submittedSnapshot: submitted,
          draftSnapshot: base,
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 4,
          contentGeneration: 2,
          snapshot: base,
        },
      ),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 4,
        contentGeneration: 2,
        snapshot: base,
      },
      pendingSnapshot: submitted,
      localSnapshot: base,
    });
  });

  it("keeps a pending write when the acknowledged baseline is ahead of the route", () => {
    const acknowledged = snapshot("acknowledged-v6", "");
    const submitted = snapshot("submitted-v7", "session summary");
    const local = snapshot("trailing-v8", "session summary");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 1,
          userId: "user-1",
          pageId: "page-1",
          sessionId: "session-1",
          baseVersion: 6,
          contentGeneration: 2,
          baseSnapshot: acknowledged,
          submittedSnapshot: submitted,
          draftSnapshot: local,
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          version: 5,
          contentGeneration: 2,
          snapshot: snapshot("stale-route-v5", ""),
        },
      ),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 6,
        contentGeneration: 2,
        snapshot: acknowledged,
      },
      pendingSnapshot: submitted,
      localSnapshot: local,
    });
  });
});
