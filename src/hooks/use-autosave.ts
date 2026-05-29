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
  const savedRef = React.useRef(content);
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
  });

  const isDirty =
    status === "unsaved" || status === "saving" || status === "error";

  const run = React.useCallback(async (next: string) => {
    setStatus("saving");
    const result = await onSaveRef.current(next);
    if (result?.error) {
      setStatus("error");
      return;
    }
    savedRef.current = next;
    setStatus("saved");
  }, []);

  const save = React.useCallback(async () => {
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
  }, [content, enabled, delay, run]);

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
