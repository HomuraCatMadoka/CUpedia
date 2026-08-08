"use client";

import * as React from "react";

import {
  createWikiDraftKey,
  WIKI_DRAFT_SCHEMA_VERSION,
  type WikiDraftRecord,
  type WikiDraftServerState,
} from "@/lib/wiki-draft";
import {
  restoreWikiEditSession,
  type WikiEditSessionAttention,
} from "@/lib/wiki-edit-session";
import {
  acknowledgeWikiDraft,
  clearWikiDraftSubmitted,
  deleteWikiDraft,
  getWikiDraftSessionId,
  markWikiDraftSubmitted,
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
    recovery: WikiEditSessionAttention,
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
  const recoveryIdentity = enabled ? `${userId}\u0000${pageId}` : null;
  const [readyIdentity, setReadyIdentity] = React.useState<string | null>(null);
  const ready = !enabled || readyIdentity === recoveryIdentity;
  const baselineRef = React.useRef({ version, contentGeneration, snapshot });
  const getSnapshotRef = React.useRef(getSnapshot);
  const onRecoveryRef = React.useRef(onRecovery);
  const keyRef = React.useRef<string | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = React.useRef(false);
  const readyPromiseRef = React.useRef<Promise<void>>(Promise.resolve());
  const baselineBarrierRef = React.useRef<Promise<void>>(Promise.resolve());
  const suspendedRef = React.useRef(false);
  const pendingChangeRef = React.useRef(false);
  const submittedSnapshotRef = React.useRef<string | null>(null);
  const recoveryDispositionRef =
    React.useRef<WikiDraftRecord["recoveryDisposition"]>(undefined);
  const activeIdentityRef = React.useRef({ userId, pageId });
  const latestServerRef = React.useRef({
    userId,
    pageId,
    version,
    contentGeneration,
    snapshot,
  });
  React.useEffect(() => {
    getSnapshotRef.current = getSnapshot;
    onRecoveryRef.current = onRecovery;
  });
  React.useEffect(() => {
    latestServerRef.current = {
      userId,
      pageId,
      version,
      contentGeneration,
      snapshot,
    };
  }, [contentGeneration, pageId, snapshot, userId, version]);
  const belongsToCurrentIdentity = React.useCallback(() => {
    const active = activeIdentityRef.current;
    return active.userId === userId && active.pageId === pageId;
  }, [pageId, userId]);

  const clearTimer = React.useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = React.useCallback(async () => {
    if (!belongsToCurrentIdentity()) return;
    clearTimer();
    if (!enabled || suspendedRef.current) return;
    if (!readyRef.current) await readyPromiseRef.current;
    if (!belongsToCurrentIdentity()) return;
    if (!readyRef.current || suspendedRef.current) return;
    while (true) {
      const barrier = baselineBarrierRef.current;
      await barrier;
      if (barrier === baselineBarrierRef.current) break;
    }
    if (!belongsToCurrentIdentity()) return;
    if (!readyRef.current || suspendedRef.current) return;
    const key = keyRef.current;
    const sessionId = sessionIdRef.current;
    if (!key) return;
    if (!sessionId) return;

    const draftSnapshot = getSnapshotRef.current();
    const base = baselineRef.current;
    const submittedSnapshot = submittedSnapshotRef.current;
    if (draftSnapshot === base.snapshot && submittedSnapshot === null) {
      if (recoveryDispositionRef.current === "manual") return;
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
      ...(submittedSnapshot === null ? {} : { submittedSnapshot }),
      draftSnapshot,
      updatedAt: Date.now(),
    });
  }, [belongsToCurrentIdentity, clearTimer, enabled, pageId, userId]);

  const notifyChange = React.useCallback(() => {
    if (!belongsToCurrentIdentity()) return;
    if (!enabled || suspendedRef.current) return;
    recoveryDispositionRef.current = undefined;
    if (!readyRef.current) {
      pendingChangeRef.current = true;
      return;
    }
    clearTimer();
    timerRef.current = setTimeout(() => {
      void flush().catch(() => {});
    }, LOCAL_PERSIST_DELAY_MS);
  }, [belongsToCurrentIdentity, clearTimer, enabled, flush]);

  const acknowledge = React.useCallback(
    async (
      acknowledgedSnapshot: string,
      nextBase: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >,
    ) => {
      if (!belongsToCurrentIdentity()) return;
      const key = keyRef.current;
      baselineRef.current = nextBase;
      submittedSnapshotRef.current = null;
      recoveryDispositionRef.current = undefined;
      if (key) {
        await acknowledgeWikiDraft(key, acknowledgedSnapshot, nextBase);
      }
    },
    [belongsToCurrentIdentity],
  );

  const discard = React.useCallback(async () => {
    if (!belongsToCurrentIdentity()) return;
    const key = keyRef.current;
    if (key) await deleteWikiDraft(key);
    if (!belongsToCurrentIdentity()) return;
    submittedSnapshotRef.current = null;
    recoveryDispositionRef.current = undefined;
  }, [belongsToCurrentIdentity]);

  const resume = React.useCallback(() => {
    if (!belongsToCurrentIdentity()) return;
    suspendedRef.current = false;
  }, [belongsToCurrentIdentity]);

  const suspend = React.useCallback(() => {
    if (!belongsToCurrentIdentity()) return;
    clearTimer();
    suspendedRef.current = true;
  }, [belongsToCurrentIdentity, clearTimer]);

  const adopt = React.useCallback(
    (
      nextBase: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >,
    ) => {
      if (!belongsToCurrentIdentity()) return Promise.resolve();
      const key = keyRef.current;
      baselineRef.current = nextBase;
      const transition = baselineBarrierRef.current.then(async () => {
        if (key) await rebaseWikiDraft(key, nextBase);
      });
      baselineBarrierRef.current = transition.catch(() => {});
      return transition;
    },
    [belongsToCurrentIdentity],
  );

  const rebase = React.useCallback(
    (
      nextBase: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >,
      recoveryDisposition?: WikiDraftRecord["recoveryDisposition"],
    ) => {
      if (!belongsToCurrentIdentity()) return Promise.resolve();
      const key = keyRef.current;
      const transition = baselineBarrierRef.current.then(async () => {
        if (key) await rebaseWikiDraft(key, nextBase, recoveryDisposition);
        if (!belongsToCurrentIdentity()) return;
        baselineRef.current = nextBase;
        if (recoveryDisposition !== undefined) {
          recoveryDispositionRef.current = recoveryDisposition;
        }
      });
      baselineBarrierRef.current = transition.catch(() => {});
      return transition;
    },
    [belongsToCurrentIdentity],
  );

  const markSubmitted = React.useCallback(
    async (submittedSnapshot: string) => {
      if (!enabled || !belongsToCurrentIdentity()) return;
      if (!readyRef.current) await readyPromiseRef.current;
      if (!belongsToCurrentIdentity()) return;
      submittedSnapshotRef.current = submittedSnapshot;
      const key = keyRef.current;
      if (key) {
        await markWikiDraftSubmitted(key, submittedSnapshot);
      }
    },
    [belongsToCurrentIdentity, enabled],
  );

  const clearSubmitted = React.useCallback(async () => {
    if (!belongsToCurrentIdentity()) return;
    const key = keyRef.current;
    submittedSnapshotRef.current = null;
    if (key) {
      await clearWikiDraftSubmitted(key);
    }
  }, [belongsToCurrentIdentity]);

  React.useEffect(() => {
    if (!enabled) return;
    activeIdentityRef.current = { userId, pageId };
    keyRef.current = null;
    sessionIdRef.current = null;
    baselineBarrierRef.current = Promise.resolve();
    suspendedRef.current = false;
    pendingChangeRef.current = false;
    submittedSnapshotRef.current = null;
    const recoveryServer = latestServerRef.current;
    let cancelled = false;
    let resolveReady!: () => void;
    readyPromiseRef.current = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    baselineRef.current = {
      version: recoveryServer.version,
      contentGeneration: recoveryServer.contentGeneration,
      snapshot: recoveryServer.snapshot,
    };
    recoveryDispositionRef.current = undefined;

    void getWikiDraftSessionId(userId, pageId)
      .then(async (sessionId) => {
        if (cancelled) return null;
        const key = createWikiDraftKey({ userId, pageId, sessionId });
        sessionIdRef.current = sessionId;
        keyRef.current = key;
        if (cancelled) return null;
        return { key, record: await readWikiDraft(key) };
      })
      .then(async (record) => {
        if (cancelled || !record) return;
        if (record.record) {
          submittedSnapshotRef.current =
            record.record.submittedSnapshot ?? null;
          recoveryDispositionRef.current = record.record.recoveryDisposition;
          const recovery = restoreWikiEditSession(record.record, {
            userId: recoveryServer.userId,
            pageId: recoveryServer.pageId,
            version: recoveryServer.version,
            contentGeneration: recoveryServer.contentGeneration,
            snapshot: recoveryServer.snapshot,
          });
          if (recovery.kind !== "discard") {
            suspendedRef.current = true;
            onRecoveryRef.current(record.record, recovery);
          } else {
            await deleteWikiDraft(record.key);
            submittedSnapshotRef.current = null;
            recoveryDispositionRef.current = undefined;
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          readyRef.current = true;
          setReadyIdentity(recoveryIdentity);
          if (pendingChangeRef.current && !suspendedRef.current) {
            pendingChangeRef.current = false;
            void flush().catch(() => {});
          }
        }
        resolveReady();
      });

    return () => {
      cancelled = true;
      clearTimer();
      readyRef.current = false;
      resolveReady();
    };
  }, [clearTimer, enabled, flush, pageId, recoveryIdentity, userId]);

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
    ready,
    notifyChange,
    flush,
    acknowledge,
    discard,
    suspend,
    resume,
    adopt,
    rebase,
    markSubmitted,
    clearSubmitted,
  };
}
