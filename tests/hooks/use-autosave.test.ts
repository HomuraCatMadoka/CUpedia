/**
 * @vitest-environment jsdom
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosave } from "@/hooks/use-autosave";

type SaveResult = {
  error?: string;
  content?: string;
  haltAutosave?: boolean;
};
type SaveReason = "autosave" | "explicit";
type SaveFn = (content: string, reason?: SaveReason) => Promise<SaveResult>;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("starts idle and not dirty", () => {
    const h = setup({ initial: "a" });
    expect(h.result.current.status).toBe("idle");
    expect(h.result.current.isDirty).toBe(false);
  });

  it("becomes dirty on notifyChange and saves the latest content after debounce", async () => {
    const h = setup({ initial: "a" });

    h.type("b");
    expect(h.result.current.isDirty).toBe(true);
    expect(h.result.current.status).toBe("unsaved");
    expect(h.onSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(h.onSave).toHaveBeenCalledWith("b", "autosave");
    expect(h.result.current.status).toBe("saved");
    expect(h.result.current.isDirty).toBe(false);
  });

  it("does not serialize on every change — content is read lazily, only when saving", async () => {
    const h = setup({ initial: "a" });

    // Many rapid edits arm the debounce but must not pull (serialize) content.
    h.type("ab");
    h.type("abc");
    h.type("abcd");
    expect(h.getContent).not.toHaveBeenCalled();
    expect(h.onSave).not.toHaveBeenCalled();

    // Content is pulled exactly when the save actually fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(h.onSave).toHaveBeenCalledWith("abcd", "autosave");
  });

  it("tracks a dirty draft without background saving when disabled (create mode)", async () => {
    const h = setup({ initial: "a", enabled: false });

    h.type("b");
    expect(h.result.current.isDirty).toBe(true);
    expect(h.result.current.status).toBe("unsaved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(h.onSave).not.toHaveBeenCalled();
  });

  it("save() flushes immediately, bypassing the debounce", async () => {
    const h = setup({ initial: "a" });

    h.type("b");
    await act(async () => {
      await h.result.current.save();
    });
    expect(h.onSave).toHaveBeenCalledTimes(1);
    expect(h.onSave).toHaveBeenCalledWith("b", "explicit");
    expect(h.result.current.status).toBe("saved");
  });

  it("surfaces error status when onSave returns an error", async () => {
    const onSave = vi
      .fn<SaveFn>()
      .mockResolvedValue({ error: "EDIT_CONFLICT" });
    const h = setup({ initial: "a", onSave });

    h.type("b");
    await act(async () => {
      await h.result.current.save();
    });
    expect(h.result.current.status).toBe("error");
    expect(h.result.current.isDirty).toBe(true);
  });

  it("reports a rejected save to an explicit flush caller", async () => {
    const onSave = vi
      .fn<SaveFn>()
      .mockRejectedValue(new Error("network offline"));
    const h = setup({ initial: "a", onSave });

    h.type("b");
    let outcome!: Awaited<ReturnType<typeof h.result.current.flush>>;
    await act(async () => {
      outcome = await h.result.current.flush();
    });

    expect(outcome).toEqual({
      status: "error",
      error: "network offline",
    });
    expect(h.result.current.status).toBe("error");
    expect(h.result.current.isDirty).toBe(true);
  });

  it("halts background retries after a conflict until the user explicitly saves", async () => {
    const onSave = vi
      .fn<SaveFn>()
      .mockResolvedValueOnce({
        error: "EDIT_CONFLICT",
        haltAutosave: true,
      })
      .mockResolvedValueOnce({ error: "EDIT_CONFLICT" });
    const h = setup({ initial: "a", onSave });

    h.type("b");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith("b", "autosave");
    expect(h.result.current.status).toBe("error");

    h.type("c");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      await h.result.current.flush();
    });
    expect(onSave).toHaveBeenNthCalledWith(2, "c", "explicit");
  });

  it("keeps a terminal explicit-save failure halted", async () => {
    const onSave = vi.fn<SaveFn>().mockResolvedValue({
      error: "EDIT_PERMISSION_DENIED",
      haltAutosave: true,
    });
    const h = setup({ initial: "a", onSave });

    h.type("b");
    await act(async () => {
      await h.result.current.flush();
    });
    h.type("c");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(h.result.current.status).toBe("error");
  });

  it("does not save again when content reverts to the saved baseline", async () => {
    const h = setup({ initial: "a" });

    h.type("b");
    await act(async () => {
      await h.result.current.save();
    });
    expect(h.onSave).toHaveBeenCalledTimes(1);

    // Content is back to the just-saved value; the debounce must find nothing to do.
    h.type("b");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(h.onSave).toHaveBeenCalledTimes(1);
    expect(h.result.current.isDirty).toBe(false);
  });

  it("adopts server-authoritative merged content as the saved baseline", async () => {
    const adoptServerContent = vi.fn<(next: string) => void>();
    const onSave = vi.fn<SaveFn>().mockImplementation(async () => {
      adoptServerContent("merged-with-theirs");
      return { content: "merged-with-theirs" };
    });
    const h = setup({ initial: "base", onSave });
    adoptServerContent.mockImplementation(h.setContent);

    h.type("mine");
    await act(async () => {
      await h.result.current.save();
    });

    expect(h.result.current.status).toBe("saved");
    expect(h.result.current.isDirty).toBe(false);

    // Re-notifying without a content change must compare against the server
    // result, not the stale request body, and therefore issue no second write.
    h.type("merged-with-theirs");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(h.result.current.isDirty).toBe(false);
  });

  it("waits for an in-flight write and flushes the trailing edit before explicit saves resolve", async () => {
    let resolveFirst!: (v: SaveResult) => void;
    let resolveSecond!: (v: SaveResult) => void;
    const onSave = vi
      .fn<SaveFn>()
      .mockImplementationOnce(
        () => new Promise<SaveResult>((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<SaveResult>((resolve) => (resolveSecond = resolve)),
      );
    const h = setup({ initial: "a", onSave });

    h.type("b");
    let first!: Promise<void>;
    let firstResolved = false;
    act(() => {
      first = h.result.current.save().then(() => {
        firstResolved = true;
      });
    });
    expect(h.result.current.status).toBe("saving");

    h.type("c");
    let second!: Promise<void>;
    let secondResolved = false;
    act(() => {
      second = h.result.current.save().then(() => {
        secondResolved = true;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);

    await act(async () => {
      resolveFirst({});
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenNthCalledWith(2, "c", "explicit");
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);

    await act(async () => {
      resolveSecond({});
      await Promise.all([first, second]);
    });

    expect(h.result.current.status).toBe("saved");
    expect(h.result.current.isDirty).toBe(false);
  });

  it("saves the trailing edit made while a save is in flight", async () => {
    let resolveFirst!: (v: SaveResult) => void;
    const onSave = vi
      .fn<SaveFn>()
      .mockImplementationOnce(
        () => new Promise<SaveResult>((r) => (resolveFirst = r)),
      )
      .mockResolvedValue({});
    const h = setup({ initial: "a", onSave });

    h.type("b");
    let first!: Promise<void>;
    act(() => {
      first = h.result.current.save();
    });
    expect(onSave).toHaveBeenNthCalledWith(1, "b", "explicit");

    // User keeps typing while "b" is still saving.
    h.type("c");
    await act(async () => {
      resolveFirst({});
      await first;
    });
    // The explicit save itself drains the trailing edit; callers such as
    // "完成" do not resolve while a newer snapshot is still pending.
    expect(onSave).toHaveBeenLastCalledWith("c", "explicit");
    expect(h.result.current.status).toBe("saved");
    expect(h.result.current.isDirty).toBe(false);
  });

  it("save() settles to saved (not stuck unsaved) when content reverted to the baseline", async () => {
    const h = setup({ initial: "a" });

    // Edit then revert to the persisted baseline; still shows unsaved + a pending
    // debounce timer.
    h.type("b");
    h.type("a");
    expect(h.result.current.status).toBe("unsaved");

    // Cmd/Ctrl+S clears the timer that would have healed — it must converge here
    // itself, not leave the doc permanently marked dirty.
    await act(async () => {
      await h.result.current.save();
    });
    expect(h.onSave).not.toHaveBeenCalled();
    expect(h.result.current.status).toBe("saved");
    expect(h.result.current.isDirty).toBe(false);

    // No stray timer resurrects the dirty state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(h.result.current.isDirty).toBe(false);
  });

  it("settles to saved (not stuck saving) when a drifted edit is reverted mid-flight", async () => {
    let resolveFirst!: (v: SaveResult) => void;
    const onSave = vi
      .fn<SaveFn>()
      .mockImplementationOnce(
        () => new Promise<SaveResult>((r) => (resolveFirst = r)),
      )
      .mockResolvedValue({});
    const h = setup({ initial: "a", onSave });

    h.type("b");
    let first!: Promise<void>;
    act(() => {
      first = h.result.current.save();
    });
    expect(h.result.current.status).toBe("saving");

    // Keep typing while "b" saves, then revert back to the in-flight snapshot
    // before its request completes.
    h.type("c");
    h.type("b");
    await act(async () => {
      resolveFirst({});
      await first;
    });

    // Nothing else is written, and the status converges instead of hanging.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(h.result.current.status).toBe("saved");
    expect(h.result.current.isDirty).toBe(false);
  });

  it("resetBaseline adopts external content as clean (conflict discard)", async () => {
    const h = setup({ initial: "a" });

    h.type("b");
    expect(h.result.current.isDirty).toBe(true);

    // The editor value was swapped to the server copy; adopt it as the new
    // baseline so the pending edit does not autosave over it.
    h.setContent("theirs");
    act(() => {
      h.result.current.resetBaseline("theirs");
    });
    expect(h.result.current.isDirty).toBe(false);
    expect(h.result.current.status).toBe("idle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(h.onSave).not.toHaveBeenCalled();
  });
});

interface SetupOpts {
  initial: string;
  enabled?: boolean;
  onSave?: Mock<SaveFn>;
}

/**
 * Drive the hook the way the editor does: a mutable content source read lazily
 * via `getContent`, and `notifyChange()` pulses on each edit. `type(next)`
 * updates the source and fires a change; `setContent(next)` swaps the source
 * without a change (used to model an external value replacement).
 */
function setup({ initial, enabled = true, onSave }: SetupOpts) {
  let current = initial;
  const save: Mock<SaveFn> = onSave ?? vi.fn<SaveFn>().mockResolvedValue({});
  const getContent = vi.fn(() => current);
  const api = renderHook(() =>
    useAutosave({
      getContent,
      onSave: save,
      initialContent: initial,
      enabled,
      delay: 1000,
    }),
  );
  return {
    ...api,
    onSave: save,
    getContent,
    type(next: string) {
      current = next;
      act(() => api.result.current.notifyChange());
    },
    setContent(next: string) {
      current = next;
    },
  };
}
