/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosave } from "@/hooks/use-autosave";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("starts idle and not dirty", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useAutosaveHarness({ content: "a", onSave }),
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.isDirty).toBe(false);
  });

  it("becomes dirty when content changes and saves after debounce", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const { result, rerender } = renderHook(
      (props) => useAutosaveHarness(props),
      { initialProps: { content: "a", onSave } },
    );

    rerender({ content: "b", onSave });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.status).toBe("unsaved");
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(onSave).toHaveBeenCalledWith("b");
    expect(result.current.status).toBe("saved");
    expect(result.current.isDirty).toBe(false);
  });

  it("does not save when disabled (create mode)", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const { rerender } = renderHook((props) => useAutosaveHarness(props), {
      initialProps: { content: "a", onSave, enabled: false },
    });

    rerender({ content: "b", onSave, enabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("save() flushes immediately bypassing debounce", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const { result, rerender } = renderHook(
      (props) => useAutosaveHarness(props),
      { initialProps: { content: "a", onSave } },
    );

    rerender({ content: "b", onSave });
    await act(async () => {
      await result.current.save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("b");
    expect(result.current.status).toBe("saved");
  });

  it("surfaces error status when onSave returns an error", async () => {
    const onSave = vi.fn().mockResolvedValue({ error: "EDIT_CONFLICT" });
    const { result, rerender } = renderHook(
      (props) => useAutosaveHarness(props),
      { initialProps: { content: "a", onSave } },
    );

    rerender({ content: "b", onSave });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.isDirty).toBe(true);
  });

  it("does not save unchanged content again after a save", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const { result, rerender } = renderHook(
      (props) => useAutosaveHarness(props),
      { initialProps: { content: "a", onSave } },
    );

    rerender({ content: "b", onSave });
    await act(async () => {
      await result.current.save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    // re-render with same content; should not trigger another save
    rerender({ content: "b", onSave });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty).toBe(false);
  });

  it("serializes overlapping saves instead of issuing concurrent requests", async () => {
    let resolve!: (v: { error?: string }) => void;
    const onSave = vi.fn(
      () => new Promise<{ error?: string }>((r) => (resolve = r)),
    );
    const { result, rerender } = renderHook(
      (props) => useAutosaveHarness(props),
      { initialProps: { content: "a", onSave } },
    );

    rerender({ content: "b", onSave });
    // First flush starts and stays in flight.
    let first!: Promise<void>;
    act(() => {
      first = result.current.save();
    });
    expect(result.current.status).toBe("saving");
    // A second trigger while in flight must be dropped, not run concurrently.
    await act(async () => {
      await result.current.save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({});
      await first;
    });
    expect(result.current.status).toBe("saved");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("saves the trailing edit made while a save is in flight", async () => {
    let resolveFirst!: (v: { error?: string }) => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<{ error?: string }>((r) => (resolveFirst = r)),
      )
      .mockResolvedValue({});
    const { result, rerender } = renderHook(
      (props) => useAutosaveHarness(props),
      { initialProps: { content: "a", onSave } },
    );

    rerender({ content: "b", onSave });
    let first!: Promise<void>;
    act(() => {
      first = result.current.save();
    });
    expect(onSave).toHaveBeenNthCalledWith(1, "b");

    // User keeps typing while "b" is still saving.
    rerender({ content: "c", onSave });
    await act(async () => {
      resolveFirst({});
      await first;
    });
    // Trailing edit must not be silently lost.
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSave).toHaveBeenLastCalledWith("c");
    expect(result.current.status).toBe("saved");
    expect(result.current.isDirty).toBe(false);
  });
});

interface HarnessProps {
  content: string;
  onSave: (content: string) => Promise<{ error?: string }>;
  enabled?: boolean;
}

function useAutosaveHarness({ content, onSave, enabled = true }: HarnessProps) {
  return useAutosave({ content, onSave, enabled, delay: 1000 });
}
