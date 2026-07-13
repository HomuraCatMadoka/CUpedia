import * as React from "react";

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

interface UseAutosaveOptions {
  /**
   * Lazily serialize the latest editor content. Called only when a save is
   * about to run — never on every keystroke — so typing does not pay the cost
   * of stringifying the whole document.
   */
  getContent: () => string;
  onSave: (content: string) => Promise<{ error?: string }>;
  /** Content already persisted at mount; edits back to this are not dirty. */
  initialContent: string;
  enabled?: boolean;
  delay?: number;
}

interface UseAutosaveResult {
  status: AutosaveStatus;
  isDirty: boolean;
  /** Flush any pending debounce and save immediately (e.g. Cmd/Ctrl+S). */
  save: () => Promise<void>;
  /** Pulse on each editor change; cheap — arms the debounce, no serialization. */
  notifyChange: () => void;
  /** Adopt externally-set content as the clean baseline (e.g. conflict discard). */
  resetBaseline: (content: string) => void;
}

/**
 * Debounced autosave driven imperatively rather than by mirroring the document
 * into React state. The editor calls `notifyChange()` on every edit (cheap: it
 * only arms a timer), and the content is serialized lazily via `getContent()`
 * exactly when a save fires. This keeps per-keystroke work off the React render
 * path — the anti-pattern Plate warns about is passing `editor.children` back
 * through state on every change (see https://platejs.org/docs/controlled).
 */
export function useAutosave({
  getContent,
  onSave,
  initialContent,
  enabled = true,
  delay = 1500,
}: UseAutosaveOptions): UseAutosaveResult {
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  // Last content known to be persisted; a save is a no-op while content matches.
  const savedRef = React.useRef(initialContent);
  const inFlightRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror the latest props/status into refs so the imperative callbacks stay
  // stable (never re-created) yet always see current values.
  const statusRef = React.useRef(status);
  const enabledRef = React.useRef(enabled);
  const delayRef = React.useRef(delay);
  const getContentRef = React.useRef(getContent);
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    statusRef.current = status;
    enabledRef.current = enabled;
    delayRef.current = delay;
    getContentRef.current = getContent;
    onSaveRef.current = onSave;
  });

  const isDirty =
    status === "unsaved" || status === "saving" || status === "error";

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // `arm` and `flush` are mutually recursive (a drifted save re-arms), so route
  // the calls through refs to keep both stable.
  const armRef = React.useRef<() => void>(() => {});
  const flushRef = React.useRef<() => Promise<void>>(async () => {});

  // Serialize saves: an overlapping request would carry a stale optimistic-lock
  // baseline and self-trigger EDIT_CONFLICT.
  const run = React.useCallback(async (next: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus("saving");
    try {
      const result = await onSaveRef.current(next);
      if (result?.error) {
        setStatus("error");
        return;
      }
      savedRef.current = next;
      if (getContentRef.current() === next) {
        setStatus("saved");
      } else {
        // Content drifted while this save was in flight; re-arm so the trailing
        // edit is not silently lost.
        armRef.current();
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const flush = React.useCallback(async () => {
    clearTimer();
    // A timer that fires mid-flight would otherwise no-op and drop the pending
    // edit; re-arm so it retries once the in-flight save completes.
    if (inFlightRef.current) {
      armRef.current();
      return;
    }
    const next = getContentRef.current();
    if (next === savedRef.current) {
      // Content is back at the persisted baseline. Converge any pending dirty
      // state — including a "saving" left over from a drifted re-arm — so the
      // UI does not hang on "未保存"/"保存中" for a doc that matches the server.
      if (statusRef.current === "unsaved" || statusRef.current === "saving") {
        setStatus("saved");
      }
      return;
    }
    await run(next);
  }, [clearTimer, run]);

  const arm = React.useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      void flushRef.current();
    }, delayRef.current);
  }, [clearTimer]);

  // Wire the mutually-recursive callbacks through refs (assigned in an effect,
  // not during render): `arm`'s timer calls `flush`, and `flush`/`run` re-`arm`.
  React.useEffect(() => {
    armRef.current = arm;
    flushRef.current = flush;
  });

  const notifyChange = React.useCallback(() => {
    if (!enabledRef.current) return;
    if (statusRef.current !== "unsaved" && statusRef.current !== "saving") {
      setStatus("unsaved");
    }
    arm();
  }, [arm]);

  const save = React.useCallback(async () => {
    clearTimer();
    if (inFlightRef.current) return;
    const next = getContentRef.current();
    if (next === savedRef.current && statusRef.current !== "error") {
      // Same convergence as the debounce path: we just cleared the timer that
      // would have healed, so settle a pending dirty state here instead of
      // leaving it stuck after a Cmd/Ctrl+S on already-in-sync content.
      if (statusRef.current === "unsaved" || statusRef.current === "saving") {
        setStatus("saved");
      }
      return;
    }
    await run(next);
  }, [clearTimer, run]);

  const resetBaseline = React.useCallback(
    (content: string) => {
      clearTimer();
      savedRef.current = content;
      setStatus("idle");
    },
    [clearTimer],
  );

  React.useEffect(() => clearTimer, [clearTimer]);

  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return { status, isDirty, save, notifyChange, resetBaseline };
}
