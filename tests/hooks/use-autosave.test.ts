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

type SaveResult = { error?: string };
type SaveFn = (content: string) => Promise<SaveResult>;

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

    expect(h.onSave).toHaveBeenCalledWith("b");
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
    expect(h.onSave).toHaveBeenCalledWith("abcd");
  });

  it("does not save when disabled (create mode)", async () => {
    const h = setup({ initial: "a", enabled: false });

    h.type("b");
    expect(h.result.current.isDirty).toBe(false);
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
    expect(h.onSave).toHaveBeenCalledWith("b");
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

  it("serializes overlapping saves instead of issuing concurrent requests", async () => {
    let resolve!: (v: SaveResult) => void;
    const onSave = vi.fn<SaveFn>(
      () => new Promise<SaveResult>((r) => (resolve = r)),
    );
    const h = setup({ initial: "a", onSave });

    h.type("b");
    // First flush starts and stays in flight.
    let first!: Promise<void>;
    act(() => {
      first = h.result.current.save();
    });
    expect(h.result.current.status).toBe("saving");
    // A second trigger while in flight must be dropped, not run concurrently.
    await act(async () => {
      await h.result.current.save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({});
      await first;
    });
    expect(h.result.current.status).toBe("saved");
    expect(onSave).toHaveBeenCalledTimes(1);
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
    expect(onSave).toHaveBeenNthCalledWith(1, "b");

    // User keeps typing while "b" is still saving.
    h.type("c");
    await act(async () => {
      resolveFirst({});
      await first;
    });
    // Trailing edit must not be silently lost.
    expect(h.result.current.isDirty).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSave).toHaveBeenLastCalledWith("c");
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

    // Keep typing while "b" saves — content drifts to "c".
    h.type("c");
    await act(async () => {
      resolveFirst({});
      await first;
    });
    // "b" is saved; content is "c" so the hook re-armed and still reads saving.
    expect(h.result.current.status).toBe("saving");

    // User reverts the trailing edit back to the saved baseline "b".
    h.type("b");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Nothing left to save, and the status must converge instead of hanging.
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
