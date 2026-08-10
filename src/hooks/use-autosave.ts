import * as React from "react";

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";
export type AutosaveSaveReason = "autosave" | "explicit";
export type AutosaveFlushResult =
  | { status: "saved" }
  | { status: "error"; error: string };

interface UseAutosaveOptions {
  /**
   * Lazily serialize the latest editor content. Called only when a save is
   * about to run — never on every keystroke — so typing does not pay the cost
   * of stringifying the whole document.
   */
  getContent: () => string;
  onSave: (
    content: string,
    reason: AutosaveSaveReason,
  ) => Promise<{
    error?: string;
    /** Server-authoritative content when a save performed a clean merge. */
    content?: string;
    /** Stop background retries until the user explicitly saves or resets. */
    haltAutosave?: boolean;
  }>;
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
  /** Drain through the latest snapshot and report whether it persisted. */
  flush: () => Promise<AutosaveFlushResult>;
  /** Pulse on each editor change; cheap — arms the debounce, no serialization. */
  notifyChange: () => void;
  /**
   * Prevent new saves from reading or submitting an unstable editor snapshot.
   * The returned idempotent function releases this hold.
   */
  holdSaves: () => () => void;
  /** Adopt externally-set content as the clean baseline (e.g. conflict discard). */
  resetBaseline: (content: string) => void;
  /** Restore a request whose server outcome was unknown across a reload. */
  restorePendingSave: (content: string) => void;
  /** Skip the unload prompt after another durable store confirms this draft. */
  releaseUnloadGuard: () => void;
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
  const inFlightRef = React.useRef<Promise<string | null> | null>(null);
  // A transport rejection cannot tell whether the server committed. Retry the
  // exact snapshot before sending newer edits so optimistic locking can first
  // converge on a known outcome.
  const uncertainSnapshotRef = React.useRef<string | null>(null);
  const haltedRef = React.useRef(false);
  const dirtyRef = React.useRef(false);
  const unloadGuardReleasedRef = React.useRef(false);
  const activeRef = React.useRef(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveHoldDepthRef = React.useRef(0);
  const saveHoldPromiseRef = React.useRef<Promise<void> | null>(null);
  const saveHoldResolveRef = React.useRef<(() => void) | null>(null);
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

  const holdSaves = React.useCallback(() => {
    clearTimer();
    if (saveHoldDepthRef.current === 0) {
      saveHoldPromiseRef.current = new Promise<void>((resolve) => {
        saveHoldResolveRef.current = resolve;
      });
    }
    saveHoldDepthRef.current += 1;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (saveHoldDepthRef.current === 0) return;
      saveHoldDepthRef.current -= 1;
      if (saveHoldDepthRef.current > 0) return;

      const resolve = saveHoldResolveRef.current;
      saveHoldPromiseRef.current = null;
      saveHoldResolveRef.current = null;
      resolve?.();
      if (
        activeRef.current &&
        enabledRef.current &&
        dirtyRef.current &&
        !haltedRef.current
      ) {
        armRef.current();
      }
    };
  }, [clearTimer]);

  // Serialize saves: an overlapping request would carry a stale optimistic-lock
  // baseline and self-trigger EDIT_CONFLICT.
  const run = React.useCallback(
    (next: string, reason: AutosaveSaveReason): Promise<string | null> => {
      if (inFlightRef.current) return inFlightRef.current;

      setStatus("saving");
      uncertainSnapshotRef.current = next;
      let saveRequest: ReturnType<typeof onSaveRef.current>;
      try {
        saveRequest = onSaveRef.current(next, reason);
      } catch (error) {
        saveRequest = Promise.reject(error);
      }

      const request = saveRequest
        .then((result) => {
          // Any server response, including a known conflict/error, resolves the
          // uncertainty. Only a thrown/rejected transport keeps this snapshot.
          uncertainSnapshotRef.current = null;
          if (!activeRef.current) return result?.error ?? null;
          if (result?.error) {
            if (result.haltAutosave) {
              haltedRef.current = true;
            }
            dirtyRef.current = true;
            setStatus("error");
            return result.error;
          }
          haltedRef.current = false;
          const savedContent = result.content ?? next;
          savedRef.current = savedContent;
          if (getContentRef.current() === savedContent) {
            dirtyRef.current = false;
            setStatus("saved");
          } else {
            dirtyRef.current = true;
            // Content drifted while this save was in flight; re-arm so a
            // background save retries it. Explicit saves additionally drain
            // the latest snapshot before resolving.
            armRef.current();
          }
          return null;
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "保存请求失败";
          dirtyRef.current = true;
          if (activeRef.current) setStatus("error");
          return message;
        })
        .finally(() => {
          if (inFlightRef.current === request) {
            inFlightRef.current = null;
          }
        });

      inFlightRef.current = request;
      return request;
    },
    [],
  );

  const flush = React.useCallback(async () => {
    if (!activeRef.current) return;
    clearTimer();
    if (saveHoldDepthRef.current > 0) return;
    if (haltedRef.current) return;
    // A timer that fires mid-flight would otherwise no-op and drop the pending
    // edit; re-arm so it retries once the in-flight save completes.
    if (inFlightRef.current) {
      armRef.current();
      return;
    }
    const next = uncertainSnapshotRef.current ?? getContentRef.current();
    if (next === savedRef.current) {
      // Content is back at the persisted baseline. Converge any pending dirty
      // state — including a "saving" left over from a drifted re-arm — so the
      // UI does not hang on "未保存"/"保存中" for a doc that matches the server.
      if (statusRef.current === "unsaved" || statusRef.current === "saving") {
        setStatus("saved");
      }
      dirtyRef.current = false;
      return;
    }
    await run(next, "autosave");
  }, [clearTimer, run]);

  const arm = React.useCallback(() => {
    if (!activeRef.current) return;
    clearTimer();
    if (saveHoldDepthRef.current > 0) return;
    if (haltedRef.current) return;
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
    unloadGuardReleasedRef.current = false;
    dirtyRef.current = true;
    if (haltedRef.current) return;
    if (statusRef.current !== "unsaved" && statusRef.current !== "saving") {
      setStatus("unsaved");
    }
    // Create mode deliberately has no background persistence, but it still
    // needs a dirty signal so Back/refresh cannot silently discard the draft.
    if (!enabledRef.current) return;
    arm();
  }, [arm]);

  const flushLatest =
    React.useCallback(async (): Promise<AutosaveFlushResult> => {
      // A user-initiated save is a drain, not a single snapshot write: wait for
      // any current request, then keep saving until the latest lazy snapshot is
      // the one known to be persisted.
      while (true) {
        if (!activeRef.current) return { status: "saved" };
        const saveHold = saveHoldPromiseRef.current;
        if (saveHold) {
          await saveHold;
          continue;
        }
        clearTimer();
        const inFlight = inFlightRef.current;
        if (inFlight) {
          const error = await inFlight;
          if (error) return { status: "error", error };
          continue;
        }

        const next = uncertainSnapshotRef.current ?? getContentRef.current();
        if (next === savedRef.current && statusRef.current !== "error") {
          // Same convergence as the debounce path: we just cleared the timer that
          // would have healed, so settle a pending dirty state here instead of
          // leaving it stuck after a Cmd/Ctrl+S on already-in-sync content.
          if (
            statusRef.current === "unsaved" ||
            statusRef.current === "saving"
          ) {
            setStatus("saved");
          }
          dirtyRef.current = false;
          return { status: "saved" };
        }
        const error = await run(next, "explicit");
        if (error) return { status: "error", error };
      }
    }, [clearTimer, run]);

  const save = React.useCallback(async () => {
    await flushLatest();
  }, [flushLatest]);

  const resetBaseline = React.useCallback(
    (content: string) => {
      clearTimer();
      haltedRef.current = false;
      uncertainSnapshotRef.current = null;
      savedRef.current = content;
      dirtyRef.current = false;
      setStatus("idle");
    },
    [clearTimer],
  );

  const restorePendingSave = React.useCallback((content: string) => {
    haltedRef.current = false;
    uncertainSnapshotRef.current = content;
  }, []);

  const releaseUnloadGuard = React.useCallback(() => {
    unloadGuardReleasedRef.current = true;
  }, []);

  React.useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      clearTimer();
      saveHoldDepthRef.current = 0;
      const resolve = saveHoldResolveRef.current;
      saveHoldPromiseRef.current = null;
      saveHoldResolveRef.current = null;
      resolve?.();
    };
  }, [clearTimer]);

  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (unloadGuardReleasedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return {
    status,
    isDirty,
    save,
    flush: flushLatest,
    notifyChange,
    holdSaves,
    resetBaseline,
    restorePendingSave,
    releaseUnloadGuard,
  };
}
