import { describe, expect, it } from "vitest";

import {
  createWikiEditSessionLeaseRegistry,
  rebaseTrailingWikiEditSnapshot,
  rejectWikiEditSessionSubmission,
  restoreWikiEditSession,
  settleWikiEditSessionSubmission,
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
  it("rebases a trailing edit onto a clean-merged committed receipt baseline", async () => {
    const submitted = JSON.stringify({
      title: "Submitted",
      icon: null,
      content: JSON.stringify([
        { id: "alpha", type: "p", children: [{ text: "Alpha" }] },
        { id: "beta", type: "p", children: [{ text: "Beta" }] },
      ]),
      parentId: null,
      editSummary: "first summary",
    });
    const local = JSON.stringify({
      title: "Submitted",
      icon: "✍️",
      content: JSON.stringify([
        { id: "alpha", type: "p", children: [{ text: "Alpha" }] },
        { id: "beta", type: "p", children: [{ text: "Beta" }] },
        { id: "tail", type: "p", children: [{ text: "Local tail" }] },
      ]),
      parentId: null,
      editSummary: "trailing summary",
    });
    const authoritative = JSON.stringify({
      title: "Remote title",
      icon: null,
      content: JSON.stringify([
        { id: "alpha", type: "p", children: [{ text: "Alpha" }] },
        {
          id: "beta",
          type: "p",
          children: [{ text: "Beta", italic: true }],
        },
      ]),
      parentId: null,
      editSummary: "first summary",
    });

    const rebased = await rebaseTrailingWikiEditSnapshot({
      submittedSnapshot: submitted,
      authoritativeSnapshot: authoritative,
      localSnapshot: local,
    });

    expect(rebased).not.toBeNull();
    expect(JSON.parse(rebased!)).toEqual({
      title: "Remote title",
      icon: "✍️",
      content: JSON.stringify([
        { id: "alpha", type: "p", children: [{ text: "Alpha" }] },
        {
          id: "beta",
          type: "p",
          children: [{ text: "Beta", italic: true }],
        },
        { id: "tail", type: "p", children: [{ text: "Local tail" }] },
      ]),
      parentId: null,
      editSummary: "trailing summary",
      hiddenChildPageIds: [],
    });
  });

  it("keeps the old ancestor when a tail and clean-merged baseline overlap", async () => {
    await expect(
      rebaseTrailingWikiEditSnapshot({
        submittedSnapshot: snapshot("Submitted", ""),
        authoritativeSnapshot: snapshot("Remote title", ""),
        localSnapshot: snapshot("Local title", ""),
      }),
    ).resolves.toBeNull();
  });

  it("adopts an authoritative empty projection instead of reviving the submitted one", async () => {
    const hiddenChildPageId = "11111111-1111-4111-8111-111111111111";
    const submitted = JSON.stringify({
      title: "Page",
      icon: null,
      content: JSON.stringify([
        { id: "body", type: "p", children: [{ text: "Body" }] },
      ]),
      parentId: null,
      editSummary: "",
      hiddenChildPageIds: [hiddenChildPageId],
    });
    const authoritative = JSON.stringify({
      title: "Page",
      icon: null,
      content: JSON.stringify([
        { id: "body", type: "p", children: [{ text: "Body" }] },
        {
          id: "wiki-projection-0",
          type: "p",
          children: [
            {
              id: "wiki-projection-0-0",
              type: "a",
              pageId: hiddenChildPageId,
              children: [{ text: "Moved child" }],
            },
          ],
        },
      ]),
      parentId: null,
      editSummary: "",
      hiddenChildPageIds: [],
    });
    const local = JSON.stringify({
      ...JSON.parse(submitted),
      icon: "✍️",
      content: JSON.stringify([
        {
          id: "body",
          type: "p",
          children: [{ text: "Body with trailing input" }],
        },
      ]),
    });

    const rebased = await rebaseTrailingWikiEditSnapshot({
      submittedSnapshot: submitted,
      authoritativeSnapshot: authoritative,
      localSnapshot: local,
    });

    expect(rebased).not.toBeNull();
    expect(JSON.parse(rebased!)).toMatchObject({
      icon: "✍️",
      hiddenChildPageIds: [],
    });
    expect(JSON.parse(JSON.parse(rebased!).content)).toEqual([
      {
        id: "body",
        type: "p",
        children: [{ text: "Body with trailing input" }],
      },
      {
        id: "wiki-projection-0",
        type: "p",
        children: [
          {
            id: "wiki-projection-0-0",
            type: "a",
            pageId: hiddenChildPageId,
            children: [{ text: "Moved child" }],
          },
        ],
      },
    ]);
  });

  it("never restores a private-draft session into the published page", () => {
    const local = snapshot("private draft", "");
    const record: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "draft",
      sessionId: "session-1",
      baseVersion: 6,
      contentGeneration: 2,
      baseSnapshot: local,
      draftSnapshot: local,
      updatedAt: 1,
    };

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        documentKind: "page",
        version: 1,
        contentGeneration: 2,
        snapshot: local,
      }),
    ).toEqual({ kind: "discard" });
  });

  it("settles a private submission already confirmed by the server before resuming its tail", () => {
    const base = snapshot("base-v4", "");
    const submitted = snapshot("submitted-v5", "");
    const trailing = snapshot("trailing-v6", "");

    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "draft",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 0,
          baseSnapshot: base,
          submitted: { id: "submission-s1", snapshot: submitted },
          draftSnapshot: trailing,
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          documentKind: "draft",
          version: 5,
          contentGeneration: 0,
          snapshot: submitted,
        },
      ),
    ).toEqual({
      kind: "resume-local",
      baseline: {
        version: 5,
        contentGeneration: 0,
        snapshot: submitted,
      },
      settledSubmissionId: "submission-s1",
      localSnapshot: trailing,
    });
  });

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

  it("advances a clean-merge baseline when only edit metadata trails", () => {
    expect(
      shouldAdvanceWikiEditBaseline({
        draftMode: false,
        submittedSnapshot: snapshot("submitted-v5", "first summary"),
        authoritativeSnapshot: snapshot(
          "merged-with-other-writer-v5",
          "first summary",
        ),
        localSnapshot: snapshot("submitted-v5", "trailing summary"),
      }),
    ).toBe(true);
  });

  it("resumes a trailing Local draft when only write metadata differs from the server Page", () => {
    const record: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
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
        documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
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
        documentKind: "page",
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
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
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
        documentKind: "page",
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
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
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
        documentKind: "page",
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
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
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
        documentKind: "page",
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
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
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
        documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
          version: 5,
          contentGeneration: 2,
          snapshot: server,
        },
      ),
    ).toEqual({ kind: "manual", reason: "server-changed" });
  });

  it("discards an ambiguous legacy record that already equals the server", () => {
    const server = snapshot("confirmed-v5", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          sessionId: "session-1",
          baseVersion: 5,
          contentGeneration: 2,
          baseSnapshot: server,
          draftSnapshot: server,
          recoveryDisposition: "legacy-ambiguous",
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          version: 5,
          contentGeneration: 2,
          snapshot: server,
        },
      ),
    ).toEqual({ kind: "discard" });
  });

  it("discards an ambiguous legacy submission already confirmed by the server", () => {
    const base = snapshot("base-v4", "");
    const submitted = snapshot("confirmed-v5", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: base,
          submittedSnapshot: submitted,
          draftSnapshot: submitted,
          recoveryDisposition: "legacy-ambiguous",
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          version: 5,
          contentGeneration: 2,
          snapshot: snapshot("confirmed-v5", ""),
        },
      ),
    ).toEqual({ kind: "discard" });
  });

  it("keeps an unconfirmed summary-only ambiguous legacy submission for manual recovery", () => {
    const server = snapshot("unchanged-v4", "");
    const submitted = snapshot("unchanged-v4", "summary that may be unsaved");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: server,
          submittedSnapshot: submitted,
          draftSnapshot: submitted,
          recoveryDisposition: "legacy-ambiguous",
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot: server,
        },
      ),
    ).toEqual({ kind: "manual", reason: "server-changed" });
  });

  it("does not treat another summary-only version as confirmation of the legacy submission", () => {
    const server = snapshot("unchanged-v4", "");
    const submitted = snapshot("unchanged-v4", "my unsaved summary");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: server,
          submittedSnapshot: submitted,
          draftSnapshot: submitted,
          recoveryDisposition: "legacy-ambiguous",
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          version: 5,
          contentGeneration: 2,
          snapshot: server,
        },
      ),
    ).toEqual({ kind: "manual", reason: "server-changed" });
  });

  it("replays an identified summary-only submission when another version has the same page state", () => {
    const base = snapshot("unchanged-v4", "");
    const submitted = snapshot("unchanged-v4", "my unsaved summary");

    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: base,
          submitted: {
            id: "00000000-0000-4000-8000-000000000432",
            snapshot: submitted,
          },
          draftSnapshot: submitted,
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          version: 5,
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
      localSnapshot: submitted,
    });
  });

  it("requires manual recovery for an unresolved ambiguous legacy edit", () => {
    const server = snapshot("server-v4", "");
    expect(
      restoreWikiEditSession(
        {
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          sessionId: "session-1",
          baseVersion: 4,
          contentGeneration: 2,
          baseSnapshot: server,
          draftSnapshot: snapshot("legacy local edit", ""),
          recoveryDisposition: "legacy-ambiguous",
          updatedAt: 1,
        },
        {
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          version: 4,
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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
          schemaVersion: 2,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
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
          documentKind: "page",
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

  it("does not let an older acknowledgement settle an identical newer submission", () => {
    const repeatedSnapshot = snapshot("same-content", "");
    const current = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 5,
      contentGeneration: 2,
      baseSnapshot: snapshot("server-v5", ""),
      submitted: {
        id: "submission-s2",
        snapshot: repeatedSnapshot,
      },
      draftSnapshot: repeatedSnapshot,
      updatedAt: 2,
    } satisfies WikiDraftRecord;

    expect(
      settleWikiEditSessionSubmission(current, {
        submissionId: "submission-s1",
        nextBase: {
          version: 6,
          contentGeneration: 2,
          snapshot: repeatedSnapshot,
        },
        deleteIfClean: true,
      }),
    ).toEqual({ kind: "stale", record: current });
  });

  it("supersedes an older lease when the same session mounts again", () => {
    const leases = createWikiEditSessionLeaseRegistry();
    const first = leases.claim("user:page:session");

    expect(first.isCurrent()).toBe(true);

    const second = leases.claim("user:page:session");

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);

    first.release();
    expect(second.isCurrent()).toBe(true);

    second.release();
    expect(second.isCurrent()).toBe(false);
  });

  it("does not let an older rejection clear the current submission", () => {
    const current = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 5,
      contentGeneration: 2,
      baseSnapshot: snapshot("server-v5", ""),
      submitted: {
        id: "submission-s2",
        snapshot: snapshot("submitted-s2", ""),
      },
      draftSnapshot: snapshot("submitted-s2", ""),
      updatedAt: 2,
    } satisfies WikiDraftRecord;

    expect(rejectWikiEditSessionSubmission(current, "submission-s1")).toEqual({
      kind: "stale",
      record: current,
    });
  });

  it("retains the latest local tail when acknowledgement beats local debounce", () => {
    const submittedSnapshot = snapshot("submitted-s1", "");
    const trailingSnapshot = snapshot("trailing-s2", "");
    const current = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: snapshot("server-v4", ""),
      submitted: {
        id: "submission-s1",
        snapshot: submittedSnapshot,
      },
      draftSnapshot: submittedSnapshot,
      updatedAt: 1,
    } satisfies WikiDraftRecord;

    expect(
      settleWikiEditSessionSubmission(current, {
        submissionId: "submission-s1",
        nextBase: {
          version: 5,
          contentGeneration: 2,
          snapshot: submittedSnapshot,
        },
        latestDraftSnapshot: trailingSnapshot,
        deleteIfClean: true,
      }),
    ).toEqual({
      kind: "settled",
      record: {
        ...current,
        baseVersion: 5,
        baseSnapshot: submittedSnapshot,
        draftSnapshot: trailingSnapshot,
        submitted: undefined,
      },
    });
  });

  it("never moves an acknowledged baseline behind a newer adopted revision", () => {
    const current = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 7,
      contentGeneration: 2,
      baseSnapshot: snapshot("server-v7", ""),
      submitted: {
        id: "submission-s1",
        snapshot: snapshot("submitted-v5", ""),
      },
      draftSnapshot: snapshot("trailing-v8", ""),
      updatedAt: 2,
    } satisfies WikiDraftRecord;

    expect(
      settleWikiEditSessionSubmission(current, {
        submissionId: "submission-s1",
        nextBase: {
          version: 5,
          contentGeneration: 2,
          snapshot: snapshot("submitted-v5", ""),
        },
        deleteIfClean: true,
      }),
    ).toEqual({
      kind: "settled",
      record: {
        ...current,
        submitted: undefined,
      },
    });
  });

  it("replays a current-schema submission before its trailing Local draft", () => {
    const base = snapshot("base-v4", "");
    const submitted = {
      id: "submission-s1",
      snapshot: snapshot("submitted-v5", ""),
    };
    const trailing = snapshot("trailing-v6", "");
    const record = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: base,
      submitted,
      draftSnapshot: trailing,
      updatedAt: 2,
    } satisfies WikiDraftRecord;

    expect(
      restoreWikiEditSession(record, {
        userId: "user-1",
        pageId: "page-1",
        documentKind: "page",
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
      pendingSnapshot: submitted.snapshot,
      localSnapshot: trailing,
    });
  });
});
