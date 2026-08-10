/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWikiDraft } from "@/hooks/use-wiki-draft";
import type { LegacyWikiDraftRecord, WikiDraftRecord } from "@/lib/wiki-draft";

const storage = vi.hoisted(() => ({
  deleteWikiDraft: vi.fn(),
  getWikiDraftSessionId: vi.fn(() => Promise.resolve("session-1")),
  prepareWikiDraftSubmission: vi.fn(),
  readWikiDraft: vi.fn<
    () => Promise<WikiDraftRecord | LegacyWikiDraftRecord | null>
  >(() => Promise.resolve(null)),
  rebaseWikiDraft: vi.fn(),
  rejectWikiDraftSubmission: vi.fn(),
  settleWikiDraftSubmission: vi.fn(),
  writeWikiDraft: vi.fn(),
}));

vi.mock("@/lib/wiki-draft-storage", () => storage);

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  storage.getWikiDraftSessionId.mockResolvedValue("session-1");
  storage.readWikiDraft.mockResolvedValue(null);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function setup(onRecovery = vi.fn(), initialSnapshot = "server") {
  let current = initialSnapshot;
  const hook = renderHook(() =>
    useWikiDraft({
      enabled: true,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      version: 4,
      contentGeneration: 2,
      snapshot: initialSnapshot,
      getSnapshot: () => current,
      onRecovery,
    }),
  );
  return {
    ...hook,
    setSnapshot(next: string) {
      current = next;
    },
  };
}

function pageSnapshot(title: string, editSummary = "") {
  return JSON.stringify({
    title,
    icon: null,
    content: JSON.stringify([{ type: "p", children: [{ text: title }] }]),
    parentId: null,
    editSummary,
  });
}

describe("useWikiDraft", () => {
  it("makes an earlier same-session lease unable to prepare another submission", async () => {
    const first = setup();
    await act(async () => Promise.resolve());
    const stalePrepare = first.result.current.prepareSubmission;

    const second = setup();
    await act(async () => Promise.resolve());
    storage.prepareWikiDraftSubmission.mockClear();

    await act(async () => {
      await stalePrepare("stale-owner-edit");
    });

    expect(storage.prepareWikiDraftSubmission).not.toHaveBeenCalled();
    second.unmount();
    first.unmount();
  });

  it("lets a superseded lease settle only the submission it already sent", async () => {
    const first = setup();
    await act(async () => Promise.resolve());
    let submitted!: { id: string; snapshot: string };
    await act(async () => {
      submitted =
        (await first.result.current.prepareSubmission("submitted-s1"))!;
    });
    const staleAcknowledge = first.result.current.acknowledge;

    const second = setup();
    await act(async () => Promise.resolve());
    storage.settleWikiDraftSubmission.mockClear();

    await act(async () => {
      await staleAcknowledge(submitted, {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      });
    });

    expect(storage.settleWikiDraftSubmission).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
      {
        submissionId: submitted.id,
        nextBase: {
          version: 5,
          contentGeneration: 2,
          snapshot: "submitted-s1",
        },
        deleteIfClean: expect.any(Function),
      },
    );
    const staleSettlement = storage.settleWikiDraftSubmission.mock.calls[0]![1]
      .deleteIfClean as () => boolean;
    expect(staleSettlement()).toBe(false);
    second.unmount();
    first.unmount();
  });

  it("revokes clean-record deletion when ownership changes during settlement", async () => {
    let finishSettlement!: () => void;
    let markSettlementStarted!: () => void;
    const settlementStarted = new Promise<void>((resolve) => {
      markSettlementStarted = resolve;
    });
    let settlementOptions!: {
      deleteIfClean: boolean | (() => boolean);
    };
    storage.settleWikiDraftSubmission.mockImplementationOnce(
      (_key, options) => {
        settlementOptions = options;
        markSettlementStarted();
        return new Promise<void>((resolve) => {
          finishSettlement = resolve;
        });
      },
    );
    const first = setup();
    await act(async () => Promise.resolve());
    let submitted!: NonNullable<
      Awaited<ReturnType<typeof first.result.current.prepareSubmission>>
    >;
    await act(async () => {
      submitted =
        (await first.result.current.prepareSubmission("submitted-s1"))!;
    });

    let acknowledging!: Promise<void>;
    act(() => {
      acknowledging = first.result.current.acknowledge(submitted, {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      });
    });
    await act(async () => settlementStarted);

    const second = setup();
    await act(async () => Promise.resolve());

    expect(settlementOptions.deleteIfClean).toEqual(expect.any(Function));
    expect(
      typeof settlementOptions.deleteIfClean === "function"
        ? settlementOptions.deleteIfClean()
        : settlementOptions.deleteIfClean,
    ).toBe(false);

    await act(async () => {
      finishSettlement();
      await acknowledging;
    });
    second.unmount();
    first.unmount();
  });

  it("settles an active submission with the latest stable local snapshot", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    let submitted!: { id: string; snapshot: string };
    hook.setSnapshot("submitted-s1");
    await act(async () => {
      submitted =
        (await hook.result.current.prepareSubmission("submitted-s1"))!;
    });
    hook.setSnapshot("trailing-s2");
    storage.settleWikiDraftSubmission.mockClear();

    await act(async () => {
      await hook.result.current.acknowledge(submitted, {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      });
    });

    expect(storage.settleWikiDraftSubmission).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
      {
        submissionId: submitted.id,
        nextBase: {
          version: 5,
          contentGeneration: 2,
          snapshot: "submitted-s1",
        },
        latestDraftSnapshot: expect.any(Function),
        deleteIfClean: expect.any(Function),
      },
    );
    const latestDraftSnapshot = storage.settleWikiDraftSubmission.mock
      .calls[0]![1].latestDraftSnapshot as () => string | undefined;
    expect(latestDraftSnapshot()).toBe("trailing-s2");
    const activeSettlement = storage.settleWikiDraftSubmission.mock.calls[0]![1]
      .deleteIfClean as () => boolean;
    expect(activeSettlement()).toBe(true);
    hook.unmount();
  });

  it("reads the local tail when settlement executes, not when acknowledgement starts", async () => {
    let finishSettlement!: () => void;
    let markSettlementStarted!: () => void;
    const settlementStarted = new Promise<void>((resolve) => {
      markSettlementStarted = resolve;
    });
    let settlementOptions!: {
      latestDraftSnapshot?: string | (() => string | undefined);
    };
    storage.settleWikiDraftSubmission.mockImplementationOnce(
      (_key, options) => {
        settlementOptions = options;
        markSettlementStarted();
        return new Promise<void>((resolve) => {
          finishSettlement = resolve;
        });
      },
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted-s1");
    const submitted = (await act(async () =>
      hook.result.current.prepareSubmission("submitted-s1"),
    ))!;

    let acknowledging!: Promise<void>;
    act(() => {
      acknowledging = hook.result.current.acknowledge(submitted, {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      });
    });
    await act(async () => settlementStarted);
    hook.setSnapshot("trailing-s2");

    expect(settlementOptions.latestDraftSnapshot).toEqual(expect.any(Function));
    expect(
      typeof settlementOptions.latestDraftSnapshot === "function"
        ? settlementOptions.latestDraftSnapshot()
        : settlementOptions.latestDraftSnapshot,
    ).toBe("trailing-s2");

    await act(async () => {
      finishSettlement();
      await acknowledging;
    });
    hook.unmount();
  });

  it("does not move the in-memory baseline behind an adopted revision", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    await act(async () => {
      await hook.result.current.adopt({
        version: 7,
        contentGeneration: 2,
        snapshot: "server-v7",
      });
    });
    hook.setSnapshot("submitted-v8");
    let submitted!: { id: string; snapshot: string };
    await act(async () => {
      submitted =
        (await hook.result.current.prepareSubmission("submitted-v8"))!;
      await hook.result.current.acknowledge(submitted, {
        version: 5,
        contentGeneration: 2,
        snapshot: "stale-v5",
      });
    });

    hook.setSnapshot("trailing-v9");
    act(() => hook.result.current.notifyChange());
    storage.writeWikiDraft.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 7,
        baseSnapshot: "server-v7",
        draftSnapshot: "trailing-v9",
      }),
    );
    hook.unmount();
  });

  it("applies an acknowledgement after an earlier queued rebase", async () => {
    let finishRebase!: () => void;
    let markRebaseStarted!: () => void;
    const rebaseStarted = new Promise<void>((resolve) => {
      markRebaseStarted = resolve;
    });
    storage.rebaseWikiDraft.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRebase = resolve;
          markRebaseStarted();
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    const submitted = (await act(async () =>
      hook.result.current.prepareSubmission("submitted edit"),
    ))!;

    let rebasing!: Promise<void>;
    act(() => {
      rebasing = hook.result.current.rebase(
        {
          version: 5,
          contentGeneration: 2,
          snapshot: "remote-v5",
        },
        "manual",
      );
    });
    await act(async () => rebaseStarted);
    let acknowledging!: Promise<void>;
    act(() => {
      acknowledging = hook.result.current.acknowledge(submitted, {
        version: 6,
        contentGeneration: 2,
        snapshot: "submitted edit",
      });
    });

    await act(async () => {
      finishRebase();
      await rebasing;
      await acknowledging;
    });
    storage.deleteWikiDraft.mockClear();
    await act(async () => hook.result.current.flush());

    expect(storage.deleteWikiDraft).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
    );
  });

  it("does not regress the in-memory baseline when an older adoption arrives", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    await act(async () => {
      await hook.result.current.adopt({
        version: 7,
        contentGeneration: 3,
        snapshot: "server-generation-3-v7",
      });
      await hook.result.current.adopt({
        version: 99,
        contentGeneration: 2,
        snapshot: "older-generation-v99",
      });
    });

    hook.setSnapshot("local-tail");
    storage.writeWikiDraft.mockClear();
    await act(async () => hook.result.current.flush());

    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 7,
        contentGeneration: 3,
        baseSnapshot: "server-generation-3-v7",
        draftSnapshot: "local-tail",
      }),
    );
    hook.unmount();
  });

  it("invalidates the prepared submission handle when a new lease takes over", async () => {
    const first = setup();
    await act(async () => Promise.resolve());
    let submitted!: {
      id: string;
      snapshot: string;
      isCurrent: () => boolean;
    };
    await act(async () => {
      submitted =
        (await first.result.current.prepareSubmission("submitted-s1"))!;
    });
    expect(submitted.isCurrent()).toBe(true);

    const second = setup();
    await act(async () => Promise.resolve());

    expect(submitted.isCurrent()).toBe(false);
    second.unmount();
    first.unmount();
  });

  it("lets a superseded lease reject only the submission it already sent", async () => {
    const first = setup();
    await act(async () => Promise.resolve());
    let submitted!: { id: string; snapshot: string };
    await act(async () => {
      submitted =
        (await first.result.current.prepareSubmission("submitted-s1"))!;
    });
    const staleReject = first.result.current.clearSubmitted;

    const second = setup();
    await act(async () => Promise.resolve());
    storage.rejectWikiDraftSubmission.mockClear();

    await act(async () => {
      await staleReject(submitted);
    });

    expect(storage.rejectWikiDraftSubmission).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
      submitted.id,
    );
    second.unmount();
    first.unmount();
  });

  it("does not let a queued rebase from a superseded lease mutate the session", async () => {
    let finishPreparation!: () => void;
    let markPreparationStarted!: () => void;
    const preparationStarted = new Promise<void>((resolve) => {
      markPreparationStarted = resolve;
    });
    storage.prepareWikiDraftSubmission.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPreparation = resolve;
          markPreparationStarted();
        }),
    );
    const first = setup();
    await act(async () => Promise.resolve());

    let preparation!: Promise<unknown>;
    let rebasing!: Promise<void>;
    act(() => {
      preparation = first.result.current.prepareSubmission("submitted-s1");
    });
    await act(async () => preparationStarted);
    act(() => {
      rebasing = first.result.current.rebase(
        {
          version: 5,
          contentGeneration: 2,
          snapshot: "server-v5",
        },
        "manual",
      );
    });

    const second = setup();
    await act(async () => Promise.resolve());
    storage.rebaseWikiDraft.mockClear();

    await act(async () => {
      finishPreparation();
      await expect(preparation).rejects.toThrow("WIKI_EDIT_SESSION_SUPERSEDED");
      await rebasing;
    });

    expect(storage.rebaseWikiDraft).not.toHaveBeenCalled();
    second.unmount();
    first.unmount();
  });

  it("retries a failed durable submission preparation without inventing an outbox entry", async () => {
    storage.prepareWikiDraftSubmission.mockRejectedValueOnce(
      new Error("IndexedDB prepare failed"),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");

    await expect(
      act(async () => hook.result.current.prepareSubmission("submitted edit")),
    ).rejects.toThrow("IndexedDB prepare failed");

    storage.writeWikiDraft.mockClear();
    hook.setSnapshot("edit after failed preparation");
    act(() => hook.result.current.retryRecovery());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.recoveryStatus).toBe("ready");
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.not.objectContaining({ submittedSnapshot: expect.anything() }),
    );
  });

  it("serializes a concurrent flush behind durable submission preparation", async () => {
    let finishPreparation!: () => void;
    let markPreparationStarted!: () => void;
    const preparationStarted = new Promise<void>((resolve) => {
      markPreparationStarted = resolve;
    });
    storage.prepareWikiDraftSubmission.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPreparation = resolve;
          markPreparationStarted();
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");

    let preparation!: Promise<unknown>;
    act(() => {
      preparation = hook.result.current.prepareSubmission("submitted edit");
    });
    await act(async () => preparationStarted);

    hook.setSnapshot("server");
    let flushing!: Promise<void>;
    act(() => {
      flushing = hook.result.current.flush();
    });
    await act(async () => Promise.resolve());

    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    await act(async () => {
      finishPreparation();
      await preparation;
      await flushing;
    });

    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        submitted: expect.objectContaining({
          id: expect.any(String),
          snapshot: "submitted edit",
        }),
        draftSnapshot: "server",
      }),
    );
  });

  it("stays booting until the IndexedDB recovery decision finishes", async () => {
    let finishRead!: (record: WikiDraftRecord | null) => void;
    storage.readWikiDraft.mockImplementation(
      () =>
        new Promise<WikiDraftRecord | null>((resolve) => {
          finishRead = resolve;
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());

    expect(hook.result.current.recoveryStatus).toBe("loading");

    await act(async () => {
      finishRead(null);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.recoveryStatus).toBe("ready");
  });

  it("keeps the editor blocked when local draft recovery storage fails", async () => {
    storage.readWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB read failed"),
    );
    const hook = setup();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current.recoveryStatus).toBe("storage-error");
    hook.setSnapshot("must not overwrite the unread draft");
    act(() => hook.result.current.notifyChange());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();

    storage.readWikiDraft.mockResolvedValueOnce(null);
    act(() => hook.result.current.retryRecovery());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current.recoveryStatus).toBe("ready");
  });

  it("persists locally before the slower network autosave debounce", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("local");
    act(() => hook.result.current.notifyChange());
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        pageId: "page-1",
        documentKind: "page",
        sessionId: "session-1",
        baseVersion: 4,
        contentGeneration: 2,
        baseSnapshot: "server",
        draftSnapshot: "local",
      }),
    );
  });

  it("blocks editing after a debounced runtime persistence failure until recovery succeeds", async () => {
    storage.writeWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB write failed"),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("local before failure");
    act(() => hook.result.current.notifyChange());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(hook.result.current.recoveryStatus).toBe("storage-error");
    storage.writeWikiDraft.mockClear();
    hook.setSnapshot("latest local after failure");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    act(() => hook.result.current.retryRecovery());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current.recoveryStatus).toBe("ready");
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftSnapshot: "latest local after failure" }),
    );
  });

  it("rejects a navigation flush while runtime storage recovery is required", async () => {
    storage.writeWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB write failed"),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("latest private draft");
    act(() => hook.result.current.notifyChange());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(hook.result.current.recoveryStatus).toBe("storage-error");

    storage.writeWikiDraft.mockClear();
    await expect(act(async () => hook.result.current.flush())).rejects.toThrow(
      "WIKI_DRAFT_STORAGE_UNAVAILABLE",
    );
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
  });

  it("retries a runtime failure from memory instead of restoring an older disk record", async () => {
    const onRecovery = vi.fn();
    const hook = setup(onRecovery);
    await act(async () => Promise.resolve());

    hook.setSnapshot("older persisted local");
    act(() => hook.result.current.notifyChange());
    await act(async () => vi.advanceTimersByTimeAsync(250));

    storage.writeWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB write failed"),
    );
    hook.setSnapshot("newer in-memory local");
    act(() => hook.result.current.notifyChange());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(hook.result.current.recoveryStatus).toBe("storage-error");

    storage.readWikiDraft.mockResolvedValueOnce({
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server",
      draftSnapshot: "older persisted local",
      updatedAt: 1,
    });
    storage.writeWikiDraft.mockClear();
    act(() => hook.result.current.retryRecovery());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storage.readWikiDraft).toHaveBeenCalledTimes(1);
    expect(onRecovery).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftSnapshot: "newer in-memory local" }),
    );
    expect(hook.result.current.recoveryStatus).toBe("ready");
  });

  it("surfaces a pagehide persistence failure as a storage error", async () => {
    storage.writeWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB pagehide write failed"),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("local before pagehide");

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current.recoveryStatus).toBe("storage-error");
  });

  it("does not lose an edit made before IndexedDB initialization finishes", async () => {
    let finishRead!: (record: WikiDraftRecord | null) => void;
    storage.readWikiDraft.mockImplementation(
      () =>
        new Promise<WikiDraftRecord | null>((resolve) => {
          finishRead = resolve;
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("typed immediately");
    act(() => hook.result.current.notifyChange());
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    await act(async () => {
      finishRead(null);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftSnapshot: "typed immediately" }),
    );
  });

  it("waits for IndexedDB initialization when navigation flushes immediately", async () => {
    let finishRead!: (record: WikiDraftRecord | null) => void;
    storage.readWikiDraft.mockImplementation(
      () =>
        new Promise<WikiDraftRecord | null>((resolve) => {
          finishRead = resolve;
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("navigate immediately");
    act(() => hook.result.current.notifyChange());

    let flushed = false;
    const flush = hook.result.current.flush().then(() => {
      flushed = true;
    });
    await act(async () => Promise.resolve());
    expect(flushed).toBe(false);

    await act(async () => {
      finishRead(null);
      await flush;
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftSnapshot: "navigate immediately" }),
    );
  });

  it("loads a session recovery decision without applying it silently", async () => {
    const base = pageSnapshot("server");
    const local = pageSnapshot("local");
    const record: WikiDraftRecord = {
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
    };
    storage.readWikiDraft.mockResolvedValue(record);
    const onRecovery = vi.fn();
    renderHook(() =>
      useWikiDraft({
        enabled: true,
        userId: "user-1",
        pageId: "page-1",
        documentKind: "page",
        version: 4,
        contentGeneration: 2,
        snapshot: base,
        getSnapshot: () => local,
        onRecovery,
      }),
    );

    await act(async () => Promise.resolve());
    expect(onRecovery).toHaveBeenCalledWith(record, {
      kind: "resume-local",
      baseline: {
        version: 4,
        contentGeneration: 2,
        snapshot: base,
      },
      localSnapshot: local,
    });
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
  });

  it("settles a confirmed private outbox before the remounted owner submits its tail", async () => {
    const base = pageSnapshot("private base");
    const submitted = pageSnapshot("private submitted");
    const trailing = pageSnapshot("private trailing");
    const record: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "draft",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 0,
      baseSnapshot: base,
      submitted: { id: "private-submission-s1", snapshot: submitted },
      draftSnapshot: trailing,
      updatedAt: 1,
    };
    storage.readWikiDraft.mockResolvedValue(record);
    const onRecovery = vi.fn();
    const hook = renderHook(() =>
      useWikiDraft({
        enabled: true,
        userId: "user-1",
        pageId: "page-1",
        documentKind: "draft",
        version: 5,
        contentGeneration: 0,
        snapshot: submitted,
        getSnapshot: () => trailing,
        onRecovery,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storage.settleWikiDraftSubmission).toHaveBeenCalledWith(
      "user-1:draft:page-1:session-1",
      {
        submissionId: "private-submission-s1",
        nextBase: {
          version: 5,
          contentGeneration: 0,
          snapshot: submitted,
        },
        deleteIfClean: false,
      },
    );
    expect(onRecovery).toHaveBeenCalledWith(
      expect.not.objectContaining({ submitted: expect.anything() }),
      expect.objectContaining({
        kind: "resume-local",
        localSnapshot: trailing,
      }),
    );

    act(() => hook.result.current.resume());
    await expect(
      act(async () => hook.result.current.prepareSubmission(trailing)),
    ).resolves.toMatchObject({ snapshot: trailing });
  });

  it("deletes an acknowledged ambiguous legacy page edit without surfacing recovery", async () => {
    const acknowledged = pageSnapshot("confirmed");
    const record: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: acknowledged,
      submittedSnapshot: acknowledged,
      draftSnapshot: acknowledged,
      recoveryDisposition: "legacy-ambiguous",
      updatedAt: 1,
    };
    storage.readWikiDraft.mockResolvedValue(record);
    const onRecovery = vi.fn();
    renderHook(() =>
      useWikiDraft({
        enabled: true,
        userId: "user-1",
        pageId: "page-1",
        documentKind: "page",
        version: 5,
        contentGeneration: 2,
        snapshot: pageSnapshot("confirmed"),
        getSnapshot: () => acknowledged,
        onRecovery,
      }),
    );

    await act(async () => Promise.resolve());
    expect(storage.deleteWikiDraft).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
    );
    expect(onRecovery).not.toHaveBeenCalled();
  });

  it("keeps a submitted snapshot when the latest draft is undone to its base", async () => {
    const pendingUndo: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server",
      submitted: {
        id: "submission-pending-undo",
        snapshot: "submitted edit",
      },
      draftSnapshot: "server",
      updatedAt: 1,
    };
    storage.readWikiDraft.mockResolvedValue(pendingUndo);
    const hook = setup();
    await act(async () => Promise.resolve());

    act(() => hook.result.current.resume());
    hook.setSnapshot("server");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSnapshot: "server",
        submitted: {
          id: "submission-pending-undo",
          snapshot: "submitted edit",
        },
        draftSnapshot: "server",
      }),
    );
  });

  it("allows a fresh submission after discarding a recovered pending draft", async () => {
    storage.readWikiDraft.mockResolvedValue({
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server",
      submitted: {
        id: "submission-recovered",
        snapshot: "recovered-pending",
      },
      draftSnapshot: "recovered-pending",
      updatedAt: 1,
    });
    const hook = setup();
    await act(async () => Promise.resolve());

    await act(async () => {
      await hook.result.current.discard();
      hook.result.current.resume();
    });
    hook.setSnapshot("fresh-edit");

    await expect(
      act(async () => hook.result.current.prepareSubmission("fresh-edit")),
    ).resolves.toMatchObject({
      snapshot: "fresh-edit",
    });
  });

  it("persists a live undo while its earlier snapshot is submitted", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await hook.result.current.prepareSubmission("submitted edit");
    });
    storage.writeWikiDraft.mockClear();
    storage.deleteWikiDraft.mockClear();

    hook.setSnapshot("server");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        submitted: expect.objectContaining({
          id: expect.any(String),
          snapshot: "submitted edit",
        }),
        draftSnapshot: "server",
      }),
    );
  });

  it("persists the local tail after its pending settlement completes", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    act(() => hook.result.current.notifyChange());
    let submitted!: NonNullable<
      Awaited<ReturnType<typeof hook.result.current.prepareSubmission>>
    >;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      submitted =
        (await hook.result.current.prepareSubmission("submitted edit"))!;
    });
    let finishAcknowledgement!: () => void;
    storage.settleWikiDraftSubmission.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishAcknowledgement = resolve;
        }),
    );

    let acknowledgement!: Promise<void>;
    act(() => {
      acknowledgement = hook.result.current.acknowledge(submitted, {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted edit",
      });
    });
    storage.writeWikiDraft.mockClear();
    hook.setSnapshot("trailing edit");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
    await act(async () => {
      finishAcknowledgement();
      await acknowledgement;
      await Promise.resolve();
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftSnapshot: "trailing edit" }),
    );
  });

  it("repairs a committed submission before persisting later edits", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    const submitted = (await act(async () =>
      hook.result.current.prepareSubmission("submitted edit"),
    ))!;
    storage.settleWikiDraftSubmission
      .mockRejectedValueOnce(new Error("IndexedDB settlement failed"))
      .mockResolvedValueOnce({ kind: "settled", record: null });

    await expect(
      act(async () =>
        hook.result.current.acknowledge(submitted, {
          version: 5,
          contentGeneration: 2,
          snapshot: "submitted edit",
        }),
      ),
    ).rejects.toThrow("IndexedDB settlement failed");

    hook.setSnapshot("trailing edit");
    storage.writeWikiDraft.mockClear();
    act(() => hook.result.current.retryRecovery());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current.recoveryStatus).toBe("ready");
    expect(storage.settleWikiDraftSubmission).toHaveBeenCalledTimes(2);
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 5,
        baseSnapshot: "submitted edit",
        draftSnapshot: "trailing edit",
      }),
    );
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.not.objectContaining({ submitted: expect.anything() }),
    );
  });

  it("fences editing when durable acknowledgement settlement fails", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    const submitted = (await act(async () =>
      hook.result.current.prepareSubmission("submitted edit"),
    ))!;
    storage.settleWikiDraftSubmission.mockRejectedValueOnce(
      new Error("IndexedDB settlement failed"),
    );

    await expect(
      act(async () =>
        hook.result.current.acknowledge(submitted, {
          version: 5,
          contentGeneration: 2,
          snapshot: "submitted edit",
        }),
      ),
    ).rejects.toThrow("IndexedDB settlement failed");
    await act(async () => Promise.resolve());

    expect(hook.result.current.recoveryStatus).toBe("storage-error");
  });

  it("retries a failed durable submission rejection before accepting a fresh submission", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("rejected edit");
    const rejected = (await act(async () =>
      hook.result.current.prepareSubmission("rejected edit"),
    ))!;
    storage.rejectWikiDraftSubmission
      .mockRejectedValueOnce(new Error("IndexedDB rejection failed"))
      .mockResolvedValueOnce(undefined);

    await expect(
      act(async () => hook.result.current.clearSubmitted(rejected)),
    ).rejects.toThrow("IndexedDB rejection failed");
    await act(async () => Promise.resolve());
    expect(hook.result.current.recoveryStatus).toBe("storage-error");

    act(() => hook.result.current.retryRecovery());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.recoveryStatus).toBe("ready");

    hook.setSnapshot("fresh edit");
    await expect(
      act(async () => hook.result.current.prepareSubmission("fresh edit")),
    ).resolves.toMatchObject({ snapshot: "fresh edit" });
    expect(storage.rejectWikiDraftSubmission).toHaveBeenCalledTimes(2);
  });

  it("does not surface recovery for trailing edits when server props advance in the active session", async () => {
    let current = "server-v4";
    const onRecovery = vi.fn();
    const hook = renderHook(
      ({ version, snapshot }: { version: number; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId: "page-1",
          documentKind: "page",
          version,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery,
        }),
      { initialProps: { version: 4, snapshot: "server-v4" } },
    );
    await act(async () => Promise.resolve());

    current = "trailing edit";
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    storage.readWikiDraft.mockResolvedValue({
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      draftSnapshot: "trailing edit",
      updatedAt: 2,
    });

    hook.rerender({ version: 5, snapshot: "server-v5" });
    await act(async () => Promise.resolve());

    expect(onRecovery).not.toHaveBeenCalled();
  });

  it("uses the new server baseline when the same hook instance changes Page ID", async () => {
    const pageTwoBase = pageSnapshot("page two server");
    const pageTwoLocal = pageSnapshot("page two local");
    const onRecovery = vi.fn();
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => pageTwoLocal,
          onRecovery,
        }),
      {
        initialProps: {
          pageId: "page-1",
          snapshot: pageSnapshot("page one server"),
        },
      },
    );
    await act(async () => Promise.resolve());

    const pageTwoRecord: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-2",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: pageTwoBase,
      draftSnapshot: pageTwoLocal,
      updatedAt: 1,
    };
    storage.readWikiDraft.mockResolvedValue(pageTwoRecord);
    hook.rerender({ pageId: "page-2", snapshot: pageTwoBase });
    await act(async () => Promise.resolve());

    expect(onRecovery).toHaveBeenCalledWith(pageTwoRecord, {
      kind: "resume-local",
      baseline: {
        version: 4,
        contentGeneration: 2,
        snapshot: pageTwoBase,
      },
      localSnapshot: pageTwoLocal,
    });
  });

  it("does not let a Page A persistence timer write after switching to Page B", async () => {
    let current = "page-a-local";
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());

    act(() => hook.result.current.notifyChange());
    current = "page-b-local-without-a-change-notification";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    storage.writeWikiDraft.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
  });

  it("does not let a late Page A acknowledgement settle Page B", async () => {
    let current = "page-a-server";
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());
    const acknowledgePageA = hook.result.current.acknowledge;
    current = "page-a-submitted";
    let pageASubmission!: NonNullable<
      Awaited<ReturnType<typeof hook.result.current.prepareSubmission>>
    >;
    await act(async () => {
      pageASubmission =
        (await hook.result.current.prepareSubmission("page-a-submitted"))!;
    });

    current = "page-b-server";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    storage.settleWikiDraftSubmission.mockClear();

    await act(async () => {
      await acknowledgePageA(pageASubmission, {
        version: 5,
        contentGeneration: 2,
        snapshot: "page-a-submitted",
      });
    });

    expect(storage.settleWikiDraftSubmission).toHaveBeenCalledWith(
      "user-1:page:page-a:session-a",
      {
        submissionId: pageASubmission.id,
        nextBase: {
          version: 5,
          contentGeneration: 2,
          snapshot: "page-a-submitted",
        },
        deleteIfClean: expect.any(Function),
      },
    );
    const pageASettlement = storage.settleWikiDraftSubmission.mock.calls[0]![1]
      .deleteIfClean as () => boolean;
    expect(pageASettlement()).toBe(false);

    current = "page-b-local";
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-b",
        sessionId: "session-b",
        baseVersion: 4,
        baseSnapshot: "page-b-server",
        draftSnapshot: "page-b-local",
      }),
    );
  });

  it("does not let a stale Page A handle suspend Page B persistence", async () => {
    let current = "page-a-server";
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());
    const suspendPageA = hook.result.current.suspend;

    current = "page-b-server";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => suspendPageA());

    current = "page-b-local";
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-b",
        sessionId: "session-b",
        baseSnapshot: "page-b-server",
        draftSnapshot: "page-b-local",
      }),
    );
  });

  it("does not let a stale Page A change notification persist Page B", async () => {
    let current = "page-a-server";
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());
    const notifyPageAChange = hook.result.current.notifyChange;

    current = "page-b-local-without-a-change-notification";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    storage.writeWikiDraft.mockClear();
    act(() => notifyPageAChange());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
  });

  it("does not let a stale Page A flush persist Page B", async () => {
    let current = "page-a-server";
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());
    const flushPageA = hook.result.current.flush;

    current = "page-b-local-without-a-change-notification";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    storage.writeWikiDraft.mockClear();
    storage.deleteWikiDraft.mockClear();

    await act(async () => flushPageA());

    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
  });

  it("makes stale Page A draft operations inert after Page B becomes active", async () => {
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => snapshot,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());
    const pageA = hook.result.current;

    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    storage.prepareWikiDraftSubmission.mockClear();
    storage.rebaseWikiDraft.mockClear();
    storage.deleteWikiDraft.mockClear();

    await act(async () => {
      await pageA.prepareSubmission("page-a-submitted");
      await pageA.rebase({
        version: 5,
        contentGeneration: 2,
        snapshot: "page-a-submitted",
      });
      await pageA.discard();
    });

    expect(storage.prepareWikiDraftSubmission).not.toHaveBeenCalled();
    expect(storage.rebaseWikiDraft).not.toHaveBeenCalled();
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
  });

  it("does not carry Page A suspension into Page B", async () => {
    let current = "page-a-server";
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());
    act(() => hook.result.current.suspend());

    current = "page-b-server";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    current = "page-b-local";
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-b",
        sessionId: "session-b",
        baseSnapshot: "page-b-server",
        draftSnapshot: "page-b-local",
      }),
    );
  });

  it("keeps persistence suspended until the caller handles a failed discard", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    storage.deleteWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB delete failed"),
    );

    act(() => hook.result.current.suspend());
    await expect(
      act(async () => hook.result.current.discard()),
    ).rejects.toThrow("IndexedDB delete failed");

    hook.setSnapshot("edit after failed discard");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    act(() => {
      hook.result.current.resume();
      hook.result.current.notifyChange();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftSnapshot: "edit after failed discard",
      }),
    );
  });

  it("preserves a submitted snapshot when discarding its draft fails", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted");
    await act(async () => hook.result.current.prepareSubmission("submitted"));
    storage.deleteWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB delete failed"),
    );

    act(() => hook.result.current.suspend());
    await expect(
      act(async () => hook.result.current.discard()),
    ).rejects.toThrow("IndexedDB delete failed");
    act(() => hook.result.current.resume());
    hook.setSnapshot("trailing edit");
    storage.writeWikiDraft.mockClear();
    await act(async () => hook.result.current.flush());

    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        submitted: expect.objectContaining({
          id: expect.any(String),
          snapshot: "submitted",
        }),
        draftSnapshot: "trailing edit",
      }),
    );
  });

  it("preserves manual recovery after a failed discard", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    await act(async () =>
      hook.result.current.rebase(
        {
          version: 5,
          contentGeneration: 2,
          snapshot: "server-v5",
        },
        "manual",
      ),
    );
    hook.setSnapshot("server-v5");
    storage.deleteWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB delete failed"),
    );

    act(() => hook.result.current.suspend());
    await expect(
      act(async () => hook.result.current.discard()),
    ).rejects.toThrow("IndexedDB delete failed");
    act(() => hook.result.current.resume());
    storage.deleteWikiDraft.mockClear();
    storage.writeWikiDraft.mockClear();
    await act(async () => hook.result.current.flush());

    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
  });

  it("does not advance the in-memory baseline when durable rebase fails", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("local edit");
    storage.rebaseWikiDraft.mockRejectedValueOnce(
      new Error("IndexedDB rebase failed"),
    );

    await expect(
      act(async () =>
        hook.result.current.rebase(
          {
            version: 5,
            contentGeneration: 2,
            snapshot: "server-v5",
          },
          "manual",
        ),
      ),
    ).rejects.toThrow("IndexedDB rebase failed");
    storage.writeWikiDraft.mockClear();
    await act(async () => hook.result.current.flush());

    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 4,
        baseSnapshot: "server",
        draftSnapshot: "local edit",
      }),
    );
  });

  it("waits for a durable rebase before flushing a resumed edit", async () => {
    let finishRebase!: () => void;
    storage.rebaseWikiDraft.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRebase = resolve;
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());

    const rebasing = hook.result.current.rebase({
      version: 5,
      contentGeneration: 2,
      snapshot: "server-v5",
    });
    hook.setSnapshot("edit after remote update");
    act(() => {
      hook.result.current.resume();
      hook.result.current.notifyChange();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    await act(async () => {
      finishRebase();
      await rebasing;
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 5,
        baseSnapshot: "server-v5",
        draftSnapshot: "edit after remote update",
      }),
    );
  });

  it("releases a waiting flush against the old baseline when rebase fails", async () => {
    let failRebase!: (error: Error) => void;
    storage.rebaseWikiDraft.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failRebase = reject;
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());

    const rebasing = hook.result.current.rebase({
      version: 5,
      contentGeneration: 2,
      snapshot: "server-v5",
    });
    hook.setSnapshot("edit while rebase fails");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    await act(async () => {
      failRebase(new Error("IndexedDB rebase failed"));
      await expect(rebasing).rejects.toThrow("IndexedDB rebase failed");
      await Promise.resolve();
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 4,
        baseSnapshot: "server",
        draftSnapshot: "edit while rebase fails",
      }),
    );
  });

  it("repairs an eagerly adopted baseline after its durable rebase fails", async () => {
    let failAdoption!: (error: Error) => void;
    storage.rebaseWikiDraft.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failAdoption = reject;
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());

    const adopting = hook.result.current.adopt({
      version: 5,
      contentGeneration: 2,
      snapshot: "server-v5",
    });
    hook.setSnapshot("edit based on server-v5");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();

    await act(async () => {
      failAdoption(new Error("IndexedDB rebase failed"));
      await expect(adopting).rejects.toThrow("IndexedDB rebase failed");
      await Promise.resolve();
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 5,
        baseSnapshot: "server-v5",
        draftSnapshot: "edit based on server-v5",
      }),
    );
  });

  it("cancels a queued Page A rebase before persisting Page B", async () => {
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    let current = "page-a-server";
    const hook = renderHook(
      ({ pageId, snapshot }: { pageId: string; snapshot: string }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId,
          documentKind: "page",
          version: 4,
          contentGeneration: 2,
          snapshot,
          getSnapshot: () => current,
          onRecovery: vi.fn(),
        }),
      { initialProps: { pageId: "page-a", snapshot: "page-a-server" } },
    );
    await act(async () => Promise.resolve());

    const pageARebase = hook.result.current.rebase({
      version: 5,
      contentGeneration: 2,
      snapshot: "page-a-server-v5",
    });
    current = "page-b-server";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    current = "page-b-local";
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-b",
        sessionId: "session-b",
        baseSnapshot: "page-b-server",
        draftSnapshot: "page-b-local",
      }),
    );

    await act(async () => pageARebase);
    expect(storage.rebaseWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).toHaveBeenCalledTimes(1);
  });

  it("recovers a same-document outbox without waiting for an unresolved server response", async () => {
    const server = pageSnapshot("server");
    const submitted = pageSnapshot("submitted");
    const trailing = pageSnapshot("trailing edit");
    const record: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-1",
      pageId: "page-1",
      documentKind: "page",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: server,
      submittedSnapshot: submitted,
      draftSnapshot: trailing,
      updatedAt: 2,
    };
    storage.readWikiDraft.mockResolvedValue(record);
    const onRecovery = vi.fn();
    setup(onRecovery, server);
    await act(async () => Promise.resolve());
    expect(onRecovery).toHaveBeenCalledWith(record, {
      kind: "resume-local",
      baseline: {
        version: 4,
        contentGeneration: 2,
        snapshot: server,
      },
      pendingSnapshot: submitted,
      localSnapshot: trailing,
    });
  });

  it("uses independent records for different tab sessions", async () => {
    storage.getWikiDraftSessionId
      .mockResolvedValueOnce("tab-a")
      .mockResolvedValueOnce("tab-b");
    const first = setup();
    const second = setup();
    await act(async () => Promise.resolve());
    first.setSnapshot("first");
    second.setSnapshot("second");
    act(() => {
      first.result.current.notifyChange();
      second.result.current.notifyChange();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "tab-a", draftSnapshot: "first" }),
    );
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "tab-b", draftSnapshot: "second" }),
    );
  });

  it("does not reuse a private-draft recovery record for the published page", async () => {
    const hook = renderHook(
      ({ documentKind }: { documentKind: "draft" | "page" }) =>
        useWikiDraft({
          enabled: true,
          userId: "user-1",
          pageId: "page-1",
          documentKind,
          version: 4,
          contentGeneration: 2,
          snapshot: "server",
          getSnapshot: () => "server",
          onRecovery: vi.fn(),
        }),
      {
        initialProps: {
          documentKind: "draft" as "draft" | "page",
        },
      },
    );
    await act(async () => Promise.resolve());

    expect(storage.readWikiDraft).toHaveBeenLastCalledWith(
      "user-1:draft:page-1:session-1",
      {
        legacyKey: "user-1:page-1:session-1",
        documentKind: "draft",
      },
    );

    hook.rerender({ documentKind: "page" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storage.readWikiDraft).toHaveBeenLastCalledWith(
      "user-1:page:page-1:session-1",
      {
        legacyKey: "user-1:page-1:session-1",
        documentKind: "page",
      },
    );
    expect(storage.readWikiDraft).toHaveBeenCalledTimes(2);
  });

  it("migrates a legacy public-page recovery record before restoring it", async () => {
    const server = pageSnapshot("server");
    const legacyRecord: LegacyWikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: server,
      draftSnapshot: pageSnapshot("legacy local edit"),
      updatedAt: 1,
    };
    const migratedRecord: WikiDraftRecord = {
      ...legacyRecord,
      schemaVersion: 2,
      documentKind: "page",
      recoveryDisposition: "legacy-ambiguous",
    };
    storage.readWikiDraft.mockResolvedValueOnce(migratedRecord);
    const onRecovery = vi.fn();

    setup(onRecovery, server);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storage.readWikiDraft).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
      {
        legacyKey: "user-1:page-1:session-1",
        documentKind: "page",
      },
    );
    expect(onRecovery).toHaveBeenCalledWith(migratedRecord, {
      kind: "manual",
      reason: "server-changed",
    });
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
  });

  it("migrates a deployed private-draft recovery record into draft identity", async () => {
    const server = pageSnapshot("private server");
    const legacyRecord: LegacyWikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: server,
      draftSnapshot: pageSnapshot("private local edit"),
      updatedAt: 1,
    };
    const migratedRecord: WikiDraftRecord = {
      ...legacyRecord,
      schemaVersion: 2,
      documentKind: "draft",
    };
    storage.readWikiDraft.mockResolvedValueOnce(migratedRecord);
    const onRecovery = vi.fn();

    renderHook(() =>
      useWikiDraft({
        enabled: true,
        userId: "user-1",
        pageId: "page-1",
        documentKind: "draft",
        version: 4,
        contentGeneration: 2,
        snapshot: server,
        getSnapshot: () => legacyRecord.draftSnapshot,
        onRecovery,
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storage.readWikiDraft).toHaveBeenCalledWith(
      "user-1:draft:page-1:session-1",
      {
        legacyKey: "user-1:page-1:session-1",
        documentKind: "draft",
      },
    );
    expect(onRecovery).toHaveBeenCalledWith(
      migratedRecord,
      expect.objectContaining({ kind: "resume-local" }),
    );
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
  });

  it("persists later edits against a recovered acknowledged baseline", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    await act(async () =>
      hook.result.current.rebase({
        version: 5,
        contentGeneration: 2,
        snapshot: "acknowledged-v5",
      }),
    );
    hook.setSnapshot("edit after recovery");
    act(() => hook.result.current.notifyChange());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 5,
        baseSnapshot: "acknowledged-v5",
        draftSnapshot: "edit after recovery",
      }),
    );
  });

  it("marks a rebased conflict draft as manual recovery only", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());

    await act(async () =>
      hook.result.current.rebase(
        {
          version: 5,
          contentGeneration: 2,
          snapshot: "server-v5",
        },
        "manual",
      ),
    );

    expect(storage.rebaseWikiDraft).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
      {
        version: 5,
        contentGeneration: 2,
        snapshot: "server-v5",
      },
      "manual",
    );
  });

  it("keeps a rejected conflict draft after returning to the server baseline", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());

    await act(async () =>
      hook.result.current.rebase(
        {
          version: 5,
          contentGeneration: 2,
          snapshot: "server-v5",
        },
        "manual",
      ),
    );
    hook.setSnapshot("server-v5");
    act(() => hook.result.current.resume());
    await act(async () => hook.result.current.flush());

    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).not.toHaveBeenCalled();
  });

  it("starts a normal draft lifecycle after editing the returned server copy", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    await act(async () =>
      hook.result.current.rebase(
        {
          version: 5,
          contentGeneration: 2,
          snapshot: "server-v5",
        },
        "manual",
      ),
    );
    act(() => hook.result.current.resume());

    hook.setSnapshot("new edit");
    act(() => hook.result.current.notifyChange());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftSnapshot: "new edit" }),
    );

    hook.setSnapshot("server-v5");
    act(() => hook.result.current.notifyChange());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(storage.deleteWikiDraft).toHaveBeenCalledWith(
      "user-1:page:page-1:session-1",
    );
  });
});
