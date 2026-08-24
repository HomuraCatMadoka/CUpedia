"use client";

import { useState } from "react";

export function CopyDeepLinkButton() {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("链接已复制");
    } catch {
      setStatus("无法复制，请从地址栏复制");
    }
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={copy}
        className="min-h-11 rounded-xl border bg-background px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        复制稳定链接
      </button>
      <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
