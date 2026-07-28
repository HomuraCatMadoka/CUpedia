"use client";

import * as React from "react";

import {
  classifyWikiDraft,
  createWikiDraftKey,
  WIKI_DRAFT_SCHEMA_VERSION,
  type WikiDraftClassification,
  type WikiDraftRecord,
  type WikiDraftServerState,
} from "@/lib/wiki-draft";
import {
  acknowledgeWikiDraft,
  deleteWikiDraft,
  getWikiDraftSessionId,
  readWikiDraft,
  rebaseWikiDraft,
  writeWikiDraft,
} from "@/lib/wiki-draft-storage";

const LOCAL_PERSIST_DELAY_MS = 250;

interface UseWikiDraftOptions extends WikiDraftServerState {
  enabled: boolean;
  getSnapshot: () => string;
  onRecovery: (
    record: WikiDraftRecord,
    classification: Exclude<WikiDraftClassification, "none">,
  ) => void;
}

export function useWikiDraft({
  enabled,
  userId,
  pageId,
  version,
  contentGeneration,
  snapshot,
  getSnapshot,
  onRecovery,
}: UseWikiDraftOptions) {
  const baselineRef = React.useRef({ version, contentGeneration, snapshot });
  const getSnapshotRef = React.useRef(getSnapshot);
  const onRecoveryRef = React.useRef(onRecovery);
  const keyRef = React.useRef<string | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = React.useRef(false);
  const suspendedRef = React.useRef(false);
  const pendingChangeRef = React.useRef(false);
  React.useEffect(() => {
    getSnapshotRef.current = getSnapshot;
    onRecoveryRef.current = onRecovery;
  });

  const clearTimer = React.useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = React.useCallback(async () => {
    clearTimer();
    const key = keyRef.current;
    const sessionId = sessionIdRef.current;
    if (!enabled || !readyRef.current || suspendedRef.current || !key) return;
    if (!sessionId) return;

    const draftSnapshot = getSnapshotRef.current();
    const base = baselineRef.current;
    if (draftSnapshot === base.snapshot) {
      await deleteWikiDraft(key);
      return;
    }
    await writeWikiDraft({
      schemaVersion: WIKI_DRAFT_SCHEMA_VERSION,
      userId,
      pageId,
      sessionId,
      baseVersion: base.version,
      contentGeneration: base.contentGeneration,
      baseSnapshot: base.snapshot,
      draftSnapshot,
      updatedAt: Date.now(),
    });
  }, [clearTimer, enabled, pageId, userId]);

  const notifyChange = React.useCallback(() => {
    if (!enabled || suspendedRef.current) return;
    if (!readyRef.current) {
      pendingChangeRef.current = true;
      return;
    }
    clearTimer();
    timerRef.current = setTimeout(() => {
      void flush().catch(() => {});
    }, LOCAL_PERSIST_DELAY_MS);
  }, [clearTimer, enabled, flush]);

  const acknowledge = React.useCallback(
    async (
      acknowledgedSnapshot: string,
      nextBase: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >,
    ) => {
      const key = keyRef.current;
      baselineRef.current = nextBase;
      if (key) {
        await acknowledgeWikiDraft(key, acknowledgedSnapshot, nextBase);
      }
    },
    [],
  );

  const discard = React.useCallback(async () => {
    const key = keyRef.current;
    if (key) await deleteWikiDraft(key);
  }, []);

  const resume = React.useCallback(() => {
    suspendedRef.current = false;
  }, []);

  const suspend = React.useCallback(() => {
    clearTimer();
    suspendedRef.current = true;
  }, [clearTimer]);

  const rebase = React.useCallback(
    async (
      nextBase: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >,
    ) => {
      baselineRef.current = nextBase;
      const key = keyRef.current;
      if (key) await rebaseWikiDraft(key, nextBase);
    },
    [],
  );

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const sessionId = getWikiDraftSessionId(userId, pageId);
    const key = createWikiDraftKey({ userId, pageId, sessionId });
    sessionIdRef.current = sessionId;
    keyRef.current = key;
    baselineRef.current = { version, contentGeneration, snapshot };

    void readWikiDraft(key)
      .then(async (record) => {
        if (cancelled) return;
        if (record) {
          const classification = classifyWikiDraft(record, {
            userId,
            pageId,
            version,
            contentGeneration,
            snapshot,
          });
          if (classification !== "none") {
            suspendedRef.current = true;
            onRecoveryRef.current(record, classification);
          } else {
            await deleteWikiDraft(key);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        readyRef.current = true;
        if (pendingChangeRef.current && !suspendedRef.current) {
          pendingChangeRef.current = false;
          void flush().catch(() => {});
        }
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
    };
  }, [contentGeneration, enabled, flush, pageId, snapshot, userId, version]);

  React.useEffect(() => {
    if (!enabled) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flush().catch(() => {});
    };
    const onPageHide = () => void flush().catch(() => {});
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, flush]);

  React.useEffect(() => clearTimer, [clearTimer]);

  return {
    notifyChange,
    flush,
    acknowledge,
    discard,
    suspend,
    resume,
    rebase,
  };
}
