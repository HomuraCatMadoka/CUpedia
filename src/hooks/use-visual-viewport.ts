"use client";

import { useSyncExternalStore } from "react";

type VisualViewportMetrics = {
  bottomInset: number;
  height: number;
  offsetTop: number;
};

function subscribe(onStoreChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onStoreChange);
  viewport?.addEventListener("scroll", onStoreChange);
  window.addEventListener("resize", onStoreChange);

  return () => {
    viewport?.removeEventListener("resize", onStoreChange);
    viewport?.removeEventListener("scroll", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
  };
}

function getSnapshot() {
  const viewport = window.visualViewport;
  if (!viewport) return `${window.innerHeight}:0:${window.innerHeight}`;

  return `${window.innerHeight}:${viewport.offsetTop}:${viewport.height}`;
}

export function useVisualViewport(): VisualViewportMetrics {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "0:0:0");
  const [layoutHeight, offsetTop, height] = snapshot.split(":").map(Number);

  return {
    bottomInset: Math.max(0, layoutHeight - offsetTop - height),
    height,
    offsetTop,
  };
}
