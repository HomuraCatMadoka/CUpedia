/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWikiDraft } from "@/hooks/use-wiki-draft";
import type { WikiDraftRecord } from "@/lib/wiki-draft";

const storage = vi.hoisted(() => ({
  acknowledgeWikiDraft: vi.fn(),
  clearWikiDraftSubmitted: vi.fn(),
  deleteWikiDraft: vi.fn(),
  getWikiDraftSessionId: vi.fn(() => Promise.resolve("session-1")),
  markWikiDraftSubmitted: vi.fn(),
  readWikiDraft: vi.fn<() => Promise<WikiDraftRecord | null>>(() =>
    Promise.resolve(null),
  ),
  rebaseWikiDraft: vi.fn(),
  writeWikiDraft: vi.fn(),
}));

vi.mock("@/lib/wiki-draft-storage", () => storage);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
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

    expect(hook.result.current.ready).toBe(false);

    await act(async () => {
      finishRead(null);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.ready).toBe(true);
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
        sessionId: "session-1",
        baseVersion: 4,
        contentGeneration: 2,
        baseSnapshot: "server",
        draftSnapshot: "local",
      }),
    );
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
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
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

  it("deletes an acknowledged session without surfacing metadata-only recovery", async () => {
    const acknowledged = pageSnapshot("confirmed", "session summary");
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: acknowledged,
      submittedSnapshot: acknowledged,
      draftSnapshot: acknowledged,
      updatedAt: 1,
    };
    storage.readWikiDraft.mockResolvedValue(record);
    const onRecovery = vi.fn();
    renderHook(() =>
      useWikiDraft({
        enabled: true,
        userId: "user-1",
        pageId: "page-1",
        version: 5,
        contentGeneration: 2,
        snapshot: pageSnapshot("confirmed"),
        getSnapshot: () => acknowledged,
        onRecovery,
      }),
    );

    await act(async () => Promise.resolve());
    expect(storage.deleteWikiDraft).toHaveBeenCalledWith(
      "user-1:page-1:session-1",
    );
    expect(onRecovery).not.toHaveBeenCalled();
  });

  it("keeps a submitted snapshot when the latest draft is undone to its base", async () => {
    const pendingUndo: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server",
      submittedSnapshot: "submitted edit",
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
        submittedSnapshot: "submitted edit",
        draftSnapshot: "server",
      }),
    );
  });

  it("persists a live undo while its earlier snapshot is submitted", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await hook.result.current.markSubmitted("submitted edit");
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
        submittedSnapshot: "submitted edit",
        draftSnapshot: "server",
      }),
    );
  });

  it("keeps a pending submission visible while its durable marker is writing", async () => {
    let finishMark!: () => void;
    storage.markWikiDraftSubmitted.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishMark = resolve;
        }),
    );
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    act(() => hook.result.current.notifyChange());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    storage.writeWikiDraft.mockClear();

    let marking!: Promise<void>;
    act(() => {
      marking = hook.result.current.markSubmitted("submitted edit");
    });
    hook.setSnapshot("server");
    await act(async () => hook.result.current.flush());

    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedSnapshot: "submitted edit",
        draftSnapshot: "server",
      }),
    );
    await act(async () => {
      finishMark();
      await marking;
    });
  });

  it("does not reattach a submitted snapshot while its acknowledgement is pending", async () => {
    const hook = setup();
    await act(async () => Promise.resolve());
    hook.setSnapshot("submitted edit");
    act(() => hook.result.current.notifyChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await hook.result.current.markSubmitted("submitted edit");
    });
    let finishAcknowledgement!: () => void;
    storage.acknowledgeWikiDraft.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishAcknowledgement = resolve;
        }),
    );

    let acknowledgement!: Promise<void>;
    act(() => {
      acknowledgement = hook.result.current.acknowledge("submitted edit", {
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

    expect(storage.writeWikiDraft).toHaveBeenCalledWith(
      expect.not.objectContaining({ submittedSnapshot: "submitted edit" }),
    );
    await act(async () => {
      finishAcknowledgement();
      await acknowledgement;
    });
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
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
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
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-2",
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

    current = "page-b-server";
    hook.rerender({ pageId: "page-b", snapshot: "page-b-server" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    storage.acknowledgeWikiDraft.mockClear();

    await act(async () => {
      await acknowledgePageA("page-a-submitted", {
        version: 5,
        contentGeneration: 2,
        snapshot: "page-a-submitted",
      });
    });

    expect(storage.acknowledgeWikiDraft).not.toHaveBeenCalled();

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
    storage.markWikiDraftSubmitted.mockClear();
    storage.clearWikiDraftSubmitted.mockClear();
    storage.rebaseWikiDraft.mockClear();
    storage.deleteWikiDraft.mockClear();

    await act(async () => {
      await pageA.markSubmitted("page-a-submitted");
      await pageA.clearSubmitted();
      await pageA.rebase({
        version: 5,
        contentGeneration: 2,
        snapshot: "page-a-submitted",
      });
      await pageA.discard();
    });

    expect(storage.markWikiDraftSubmitted).not.toHaveBeenCalled();
    expect(storage.clearWikiDraftSubmitted).not.toHaveBeenCalled();
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
    await act(async () => hook.result.current.markSubmitted("submitted"));
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
        submittedSnapshot: "submitted",
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

  it("does not let a pending Page A rebase block or mutate Page B", async () => {
    let finishPageARebase!: () => void;
    storage.rebaseWikiDraft.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPageARebase = resolve;
        }),
    );
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

    await act(async () => {
      finishPageARebase();
      await pageARebase;
    });
    expect(storage.writeWikiDraft).toHaveBeenCalledTimes(1);
  });

  it("recovers a same-document outbox without waiting for an unresolved server response", async () => {
    const server = pageSnapshot("server");
    const submitted = pageSnapshot("submitted");
    const trailing = pageSnapshot("trailing edit");
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
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
      "user-1:page-1:session-1",
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
      "user-1:page-1:session-1",
    );
  });
});
