import * as React from "react";

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

interface UseAutosaveOptions {
  content: string;
  onSave: (content: string) => Promise<{ error?: string }>;
  enabled?: boolean;
  delay?: number;
}

interface UseAutosaveResult {
  status: AutosaveStatus;
  isDirty: boolean;
  save: () => Promise<void>;
}

export function useAutosave({
  content,
  onSave,
  enabled = true,
  delay = 1500,
}: UseAutosaveOptions): UseAutosaveResult {
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  // Bumped after a save lands while content has drifted, to re-arm the debounce.
  const [retryNonce, setRetryNonce] = React.useState(0);
  const savedRef = React.useRef(content);
  const latestRef = React.useRef(content);
  const inFlightRef = React.useRef(false);
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
    latestRef.current = content;
  });

  const isDirty =
    status === "unsaved" || status === "saving" || status === "error";

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
      if (latestRef.current === next) {
        setStatus("saved");
      } else {
        // Content drifted while this save was in flight; re-arm the debounce so
        // the trailing edit is not silently lost.
        setRetryNonce((n) => n + 1);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const save = React.useCallback(async () => {
    if (inFlightRef.current) return;
    if (content === savedRef.current && status !== "error") return;
    await run(content);
  }, [content, status, run]);

  React.useEffect(() => {
    if (!enabled || content === savedRef.current) return;
    setStatus("unsaved");
    const handle = setTimeout(() => {
      if (content !== savedRef.current) void run(content);
    }, delay);
    return () => clearTimeout(handle);
  }, [content, enabled, delay, run, retryNonce]);

  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return { status, isDirty, save };
}
