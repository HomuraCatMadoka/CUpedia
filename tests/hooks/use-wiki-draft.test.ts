/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWikiDraft } from "@/hooks/use-wiki-draft";
import type { WikiDraftRecord } from "@/lib/wiki-draft";

const storage = vi.hoisted(() => ({
  acknowledgeWikiDraft: vi.fn(),
  deleteWikiDraft: vi.fn(),
  getWikiDraftSessionId: vi.fn(() => "session-1"),
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
  storage.getWikiDraftSessionId.mockReturnValue("session-1");
  storage.readWikiDraft.mockResolvedValue(null);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function setup(onRecovery = vi.fn()) {
  let current = "server";
  const hook = renderHook(() =>
    useWikiDraft({
      enabled: true,
      userId: "user-1",
      pageId: "page-1",
      version: 4,
      contentGeneration: 2,
      snapshot: "server",
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

describe("useWikiDraft", () => {
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

  it("loads a recoverable session draft without applying it silently", async () => {
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-1",
      pageId: "page-1",
      sessionId: "session-1",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server",
      draftSnapshot: "local",
      updatedAt: 1,
    };
    storage.readWikiDraft.mockResolvedValue(record);
    const onRecovery = vi.fn();
    setup(onRecovery);

    await act(async () => Promise.resolve());
    expect(onRecovery).toHaveBeenCalledWith(record, "recoverable");
    expect(storage.deleteWikiDraft).not.toHaveBeenCalled();
  });

  it("uses independent records for different tab sessions", async () => {
    storage.getWikiDraftSessionId
      .mockReturnValueOnce("tab-a")
      .mockReturnValueOnce("tab-b");
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
});
