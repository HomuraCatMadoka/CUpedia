"use client";

import * as React from "react";

import {
  compareWikiDraftBaselines,
  createLegacyWikiDraftKey,
  createWikiDraftKey,
  WIKI_DRAFT_SCHEMA_VERSION,
  type WikiDraftRecord,
  type WikiDraftServerState,
  type WikiDraftSubmission,
} from "@/lib/wiki-draft";
import {
  restoreWikiEditSession,
  wikiEditSessionLeases,
  type WikiEditSessionAttention,
  type WikiEditSessionLease,
  type WikiPreparedSubmission,
} from "@/lib/wiki-edit-session";
import {
  deleteWikiDraft,
  getWikiDraftSessionId,
  prepareWikiDraftSubmission,
  readWikiDraft,
  rebaseWikiDraft,
  rejectWikiDraftSubmission,
  settleWikiDraftSubmission,
  writeWikiDraft,
} from "@/lib/wiki-draft-storage";

const LOCAL_PERSIST_DELAY_MS = 250;

interface UseWikiDraftOptions extends Omit<
  WikiDraftServerState,
  "documentKind"
> {
  enabled: boolean;
  documentKind?: WikiDraftServerState["documentKind"];
  getSnapshot: () => string;
  onRecovery: (
    record: WikiDraftRecord,
    recovery: WikiEditSessionAttention,
  ) => void;
}

type WikiDraftBaseline = Pick<
  WikiDraftServerState,
  "version" | "contentGeneration" | "snapshot"
>;

interface PendingWikiDraftSettlement {
  acknowledged: WikiDraftSubmission;
  nextBase: WikiDraftBaseline;
  context: { key: string; lease: WikiEditSessionLease };
  leaseWasCurrent: boolean;
}

interface PendingWikiDraftRejection {
  rejected: WikiDraftSubmission;
  context: { key: string; lease: WikiEditSessionLease };
}

export function useWikiDraft({
  enabled,
  userId,
  pageId,
  documentKind = "page",
  version,
  contentGeneration,
  snapshot,
  getSnapshot,
  onRecovery,
}: UseWikiDraftOptions) {
  const recoveryIdentity = enabled
    ? `${userId}\u0000${documentKind}\u0000${pageId}`
    : null;
  const [readyIdentity, setReadyIdentity] = React.useState<string | null>(null);
  const [failedIdentity, setFailedIdentity] = React.useState<string | null>(
    null,
  );
  const [recoveryAttempt, setRecoveryAttempt] = React.useState(0);
  const recoveryStatus =
    !enabled || readyIdentity === recoveryIdentity
      ? "ready"
      : failedIdentity === recoveryIdentity
        ? "storage-error"
        : "loading";
  const baselineRef = React.useRef({ version, contentGeneration, snapshot });
  const getSnapshotRef = React.useRef(getSnapshot);
  const onRecoveryRef = React.useRef(onRecovery);
  const keyRef = React.useRef<string | null>(null);
  const leaseRef = React.useRef<WikiEditSessionLease | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = React.useRef(false);
  const readyPromiseRef = React.useRef<Promise<void>>(Promise.resolve());
  const transitionBarrierRef = React.useRef<Promise<void>>(Promise.resolve());
  const suspendedRef = React.useRef(false);
  const pendingChangeRef = React.useRef(false);
  const legacySubmittedSnapshotRef = React.useRef<string | null>(null);
  const submittedRef = React.useRef<WikiDraftSubmission | null>(null);
  const pendingSettlementRef = React.useRef<PendingWikiDraftSettlement | null>(
    null,
  );
  const pendingRejectionRef = React.useRef<PendingWikiDraftRejection | null>(
    null,
  );
  const runtimeStorageFailureRef = React.useRef(false);
  const runtimeStorageRetryingRef = React.useRef(false);
  const submissionContextsRef = React.useRef(
    new Map<string, { key: string; lease: WikiEditSessionLease }>(),
  );
  const recoveryDispositionRef =
    React.useRef<WikiDraftRecord["recoveryDisposition"]>(undefined);
  const activeIdentityRef = React.useRef({ userId, pageId, documentKind });
  const latestServerRef = React.useRef({
    userId,
    pageId,
    documentKind,
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
      documentKind,
      version,
      contentGeneration,
      snapshot,
    };
  }, [contentGeneration, documentKind, pageId, snapshot, userId, version]);
  const belongsToCurrentIdentity = React.useCallback(() => {
    const active = activeIdentityRef.current;
    return (
      active.userId === userId &&
      active.pageId === pageId &&
      active.documentKind === documentKind &&
      (leaseRef.current === null || leaseRef.current.isCurrent())
    );
  }, [documentKind, pageId, userId]);

  const clearTimer = React.useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const enqueueWikiDraftTransition = React.useCallback(
    <T>(run: () => Promise<T>) => {
      const transition = transitionBarrierRef.current.then(run);
      transitionBarrierRef.current = transition.then(
        () => undefined,
        () => undefined,
      );
      return transition;
    },
    [],
  );

  const markStorageFailure = React.useCallback(() => {
    if (!recoveryIdentity || !belongsToCurrentIdentity()) return;
    runtimeStorageFailureRef.current = true;
    clearTimer();
    readyRef.current = false;
    suspendedRef.current = true;
    pendingChangeRef.current = true;
    setReadyIdentity(null);
    setFailedIdentity(recoveryIdentity);
  }, [belongsToCurrentIdentity, clearTimer, recoveryIdentity]);

  const settleAcknowledgedSubmission = React.useCallback(
    async (settlement: PendingWikiDraftSettlement) => {
      const { acknowledged, context, leaseWasCurrent, nextBase } = settlement;
      try {
        await settleWikiDraftSubmission(context.key, {
          submissionId: acknowledged.id,
          nextBase,
          ...(leaseWasCurrent
            ? {
                latestDraftSnapshot: () =>
                  context.lease.isCurrent()
                    ? getSnapshotRef.current()
                    : undefined,
              }
            : {}),
          deleteIfClean: () => context.lease.isCurrent(),
        });
      } catch (error) {
        markStorageFailure();
        throw error;
      }
      if (pendingSettlementRef.current?.acknowledged.id === acknowledged.id) {
        pendingSettlementRef.current = null;
      }
      submissionContextsRef.current.delete(acknowledged.id);
      if (!context.lease.isCurrent() || !belongsToCurrentIdentity()) return;
      if (submittedRef.current?.id === acknowledged.id) {
        submittedRef.current = null;
        legacySubmittedSnapshotRef.current = null;
      }
      const currentBase = baselineRef.current;
      if (compareWikiDraftBaselines(nextBase, currentBase) >= 0) {
        baselineRef.current = nextBase;
      }
      recoveryDispositionRef.current = undefined;
    },
    [belongsToCurrentIdentity, markStorageFailure],
  );

  const settleRejectedSubmission = React.useCallback(
    async (rejection: PendingWikiDraftRejection) => {
      const { rejected, context } = rejection;
      try {
        await rejectWikiDraftSubmission(context.key, rejected.id);
      } catch (error) {
        markStorageFailure();
        throw error;
      }
      if (pendingRejectionRef.current?.rejected.id === rejected.id) {
        pendingRejectionRef.current = null;
      }
      submissionContextsRef.current.delete(rejected.id);
      if (!context.lease.isCurrent() || !belongsToCurrentIdentity()) return;
      if (submittedRef.current?.id === rejected.id) {
        if (pendingSettlementRef.current?.acknowledged.id === rejected.id) {
          pendingSettlementRef.current = null;
        }
        legacySubmittedSnapshotRef.current = null;
        submittedRef.current = null;
      }
    },
    [belongsToCurrentIdentity, markStorageFailure],
  );

  const flush = React.useCallback(
    async (allowRuntimeRecovery = false) => {
      try {
        if (!belongsToCurrentIdentity()) return;
        clearTimer();
        if (!enabled) return;
        if (runtimeStorageFailureRef.current && !allowRuntimeRecovery) {
          throw new Error("WIKI_DRAFT_STORAGE_UNAVAILABLE");
        }
        if (suspendedRef.current) return;
        if (!readyRef.current) await readyPromiseRef.current;
        if (!belongsToCurrentIdentity()) return;
        if (runtimeStorageFailureRef.current && !allowRuntimeRecovery) {
          throw new Error("WIKI_DRAFT_STORAGE_UNAVAILABLE");
        }
        if (!readyRef.current || suspendedRef.current) return;
        while (true) {
          const barrier = transitionBarrierRef.current;
          await barrier;
          if (barrier === transitionBarrierRef.current) break;
        }
        if (!belongsToCurrentIdentity()) return;
        if (runtimeStorageFailureRef.current && !allowRuntimeRecovery) {
          throw new Error("WIKI_DRAFT_STORAGE_UNAVAILABLE");
        }
        if (!readyRef.current || suspendedRef.current) return;
        const pendingSettlement = pendingSettlementRef.current;
        if (pendingSettlement) {
          await settleAcknowledgedSubmission(pendingSettlement);
        }
        const pendingRejection = pendingRejectionRef.current;
        if (pendingRejection) {
          await settleRejectedSubmission(pendingRejection);
        }
        const key = keyRef.current;
        const sessionId = sessionIdRef.current;
        if (!key) return;
        if (!sessionId) return;

        const draftSnapshot = getSnapshotRef.current();
        const base = baselineRef.current;
        const submitted = submittedRef.current;
        const submittedSnapshot =
          submitted?.snapshot ?? legacySubmittedSnapshotRef.current;
        if (draftSnapshot === base.snapshot && submittedSnapshot === null) {
          if (recoveryDispositionRef.current === "manual") return;
          await deleteWikiDraft(key);
          return;
        }
        await writeWikiDraft({
          schemaVersion: WIKI_DRAFT_SCHEMA_VERSION,
          userId,
          pageId,
          documentKind,
          sessionId,
          baseVersion: base.version,
          contentGeneration: base.contentGeneration,
          baseSnapshot: base.snapshot,
          ...(submitted
            ? { submitted }
            : submittedSnapshot === null
              ? {}
              : { submittedSnapshot }),
          draftSnapshot,
          updatedAt: Date.now(),
        });
      } catch (error) {
        markStorageFailure();
        throw error;
      }
    },
    [
      belongsToCurrentIdentity,
      clearTimer,
      documentKind,
      enabled,
      markStorageFailure,
      pageId,
      settleAcknowledgedSubmission,
      settleRejectedSubmission,
      userId,
    ],
  );

  const retryRecovery = React.useCallback(() => {
    if (!enabled) return;
    if (
      runtimeStorageFailureRef.current &&
      recoveryIdentity &&
      belongsToCurrentIdentity()
    ) {
      if (runtimeStorageRetryingRef.current) return;
      runtimeStorageRetryingRef.current = true;
      suspendedRef.current = false;
      readyRef.current = true;
      void flush(true)
        .then(() => {
          if (!belongsToCurrentIdentity()) return;
          runtimeStorageFailureRef.current = false;
          pendingChangeRef.current = false;
          setFailedIdentity(null);
          setReadyIdentity(recoveryIdentity);
        })
        .catch(() => {})
        .finally(() => {
          runtimeStorageRetryingRef.current = false;
        });
      return;
    }
    readyRef.current = false;
    setReadyIdentity(null);
    setFailedIdentity(null);
    setRecoveryAttempt((attempt) => attempt + 1);
  }, [belongsToCurrentIdentity, enabled, flush, recoveryIdentity]);

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
      acknowledged: WikiDraftSubmission,
      nextBase: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >,
    ) => {
      const context = submissionContextsRef.current.get(acknowledged.id);
      if (!context) return;
      const leaseWasCurrent = context.lease.isCurrent();
      const settlement: PendingWikiDraftSettlement = {
        acknowledged,
        nextBase,
        context,
        leaseWasCurrent,
      };
      if (leaseWasCurrent && belongsToCurrentIdentity()) {
        pendingSettlementRef.current = settlement;
        return enqueueWikiDraftTransition(() =>
          settleAcknowledgedSubmission(settlement),
        );
      }
      return settleAcknowledgedSubmission(settlement);
    },
    [
      belongsToCurrentIdentity,
      enqueueWikiDraftTransition,
      settleAcknowledgedSubmission,
    ],
  );

  const discard = React.useCallback(async () => {
    if (!belongsToCurrentIdentity()) return;
    const key = keyRef.current;
    if (key) await deleteWikiDraft(key);
    if (!belongsToCurrentIdentity()) return;
    const submitted = submittedRef.current;
    if (submitted) submissionContextsRef.current.delete(submitted.id);
    pendingSettlementRef.current = null;
    submittedRef.current = null;
    legacySubmittedSnapshotRef.current = null;
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
      const lease = leaseRef.current;
      if (compareWikiDraftBaselines(nextBase, baselineRef.current) >= 0) {
        baselineRef.current = nextBase;
      }
      return enqueueWikiDraftTransition(async () => {
        if (!lease?.isCurrent() || !belongsToCurrentIdentity()) return;
        if (key) await rebaseWikiDraft(key, nextBase);
      });
    },
    [belongsToCurrentIdentity, enqueueWikiDraftTransition],
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
      const lease = leaseRef.current;
      return enqueueWikiDraftTransition(async () => {
        if (!lease?.isCurrent() || !belongsToCurrentIdentity()) return;
        if (key) await rebaseWikiDraft(key, nextBase, recoveryDisposition);
        if (!lease.isCurrent() || !belongsToCurrentIdentity()) return;
        if (compareWikiDraftBaselines(nextBase, baselineRef.current) >= 0) {
          baselineRef.current = nextBase;
        }
        if (recoveryDisposition !== undefined) {
          recoveryDispositionRef.current = recoveryDisposition;
        }
      });
    },
    [belongsToCurrentIdentity, enqueueWikiDraftTransition],
  );

  const prepareSubmission = React.useCallback(
    (submittedSnapshot: string) => {
      clearTimer();
      return enqueueWikiDraftTransition(async () => {
        if (!enabled || !belongsToCurrentIdentity()) return;
        if (!readyRef.current) await readyPromiseRef.current;
        if (!belongsToCurrentIdentity()) return;
        if (!readyRef.current || suspendedRef.current) return;
        const pendingSettlement = pendingSettlementRef.current;
        if (pendingSettlement) {
          await settleAcknowledgedSubmission(pendingSettlement);
        }
        const pendingRejection = pendingRejectionRef.current;
        if (pendingRejection) {
          await settleRejectedSubmission(pendingRejection);
        }
        const sessionId = sessionIdRef.current;
        if (!sessionId) return;
        const key = keyRef.current;
        const lease = leaseRef.current;
        if (!key || !lease?.isCurrent()) return;
        const existing = submittedRef.current;
        if (existing) {
          if (existing.snapshot !== submittedSnapshot) {
            throw new Error("WIKI_DRAFT_SUBMISSION_PENDING");
          }
          submissionContextsRef.current.set(existing.id, { key, lease });
          return {
            ...existing,
            isCurrent: () => lease.isCurrent(),
          } satisfies WikiPreparedSubmission;
        }
        const base = baselineRef.current;
        const submitted: WikiDraftSubmission = {
          id: crypto.randomUUID(),
          snapshot: submittedSnapshot,
        };
        try {
          await prepareWikiDraftSubmission({
            schemaVersion: WIKI_DRAFT_SCHEMA_VERSION,
            userId,
            pageId,
            documentKind,
            sessionId,
            baseVersion: base.version,
            contentGeneration: base.contentGeneration,
            baseSnapshot: base.snapshot,
            submitted,
            draftSnapshot: getSnapshotRef.current(),
            updatedAt: Date.now(),
          });
        } catch (error) {
          markStorageFailure();
          throw error;
        }
        if (!belongsToCurrentIdentity() || !lease.isCurrent()) {
          throw new Error("WIKI_EDIT_SESSION_SUPERSEDED");
        }
        submittedRef.current = submitted;
        legacySubmittedSnapshotRef.current = null;
        submissionContextsRef.current.set(submitted.id, { key, lease });
        return {
          ...submitted,
          isCurrent: () => lease.isCurrent(),
        } satisfies WikiPreparedSubmission;
      });
    },
    [
      belongsToCurrentIdentity,
      clearTimer,
      documentKind,
      enabled,
      enqueueWikiDraftTransition,
      pageId,
      markStorageFailure,
      settleAcknowledgedSubmission,
      settleRejectedSubmission,
      userId,
    ],
  );

  const clearSubmitted = React.useCallback(
    async (submitted: WikiDraftSubmission) => {
      const context = submissionContextsRef.current.get(submitted.id);
      if (!context) return;
      const pending = pendingRejectionRef.current;
      const rejection =
        pending?.rejected.id === submitted.id
          ? pending
          : { rejected: submitted, context };
      pendingRejectionRef.current = rejection;
      return enqueueWikiDraftTransition(() =>
        settleRejectedSubmission(rejection),
      );
    },
    [enqueueWikiDraftTransition, settleRejectedSubmission],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const previousIdentity = activeIdentityRef.current;
    const identityIsUnchanged =
      previousIdentity.userId === userId &&
      previousIdentity.pageId === pageId &&
      previousIdentity.documentKind === documentKind;
    activeIdentityRef.current = { userId, pageId, documentKind };
    leaseRef.current?.release();
    leaseRef.current = null;
    keyRef.current = null;
    sessionIdRef.current = null;
    transitionBarrierRef.current = Promise.resolve();
    suspendedRef.current = false;
    if (!identityIsUnchanged) pendingChangeRef.current = false;
    if (!identityIsUnchanged) runtimeStorageFailureRef.current = false;
    runtimeStorageRetryingRef.current = false;
    legacySubmittedSnapshotRef.current = null;
    pendingSettlementRef.current = null;
    pendingRejectionRef.current = null;
    submittedRef.current = null;
    const recoveryServer = latestServerRef.current;
    let cancelled = false;
    let recoveryFailed = false;
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

    void getWikiDraftSessionId(userId, pageId, documentKind)
      .then(async (sessionId) => {
        if (cancelled) return null;
        const key = createWikiDraftKey({
          userId,
          pageId,
          documentKind,
          sessionId,
        });
        const lease = wikiEditSessionLeases.claim(key);
        if (cancelled) {
          lease.release();
          return null;
        }
        leaseRef.current = lease;
        sessionIdRef.current = sessionId;
        keyRef.current = key;
        if (cancelled) return null;
        const legacyKey = createLegacyWikiDraftKey({
          userId,
          pageId,
          sessionId,
        });
        const record = await readWikiDraft(key, {
          legacyKey,
          documentKind,
        });
        return { key, record };
      })
      .then(async (record) => {
        if (cancelled || !record) return;
        if (record.record) {
          let recoveryRecord = record.record;
          const submitted = recoveryRecord.submitted ?? null;
          submittedRef.current = submitted;
          legacySubmittedSnapshotRef.current = submitted
            ? null
            : (recoveryRecord.submittedSnapshot ?? null);
          recoveryDispositionRef.current = recoveryRecord.recoveryDisposition;
          const recovery = restoreWikiEditSession(recoveryRecord, {
            userId: recoveryServer.userId,
            pageId: recoveryServer.pageId,
            documentKind: recoveryServer.documentKind,
            version: recoveryServer.version,
            contentGeneration: recoveryServer.contentGeneration,
            snapshot: recoveryServer.snapshot,
          });
          if (
            recovery.kind === "resume-local" &&
            recovery.settledSubmissionId
          ) {
            await settleWikiDraftSubmission(record.key, {
              submissionId: recovery.settledSubmissionId,
              nextBase: recovery.baseline,
              deleteIfClean: false,
            });
            if (cancelled) return;
            recoveryRecord = { ...recoveryRecord };
            delete recoveryRecord.submitted;
            delete recoveryRecord.submittedSnapshot;
            recoveryRecord.baseVersion = recovery.baseline.version;
            recoveryRecord.contentGeneration =
              recovery.baseline.contentGeneration;
            recoveryRecord.baseSnapshot = recovery.baseline.snapshot;
            submittedRef.current = null;
            legacySubmittedSnapshotRef.current = null;
          }
          if (recovery.kind !== "discard") {
            suspendedRef.current = true;
            onRecoveryRef.current(recoveryRecord, recovery);
          } else {
            await deleteWikiDraft(record.key);
            legacySubmittedSnapshotRef.current = null;
            submittedRef.current = null;
            recoveryDispositionRef.current = undefined;
          }
        }
      })
      .catch(() => {
        recoveryFailed = true;
        if (!cancelled) setFailedIdentity(recoveryIdentity);
      })
      .finally(() => {
        if (!cancelled && !recoveryFailed) {
          readyRef.current = true;
          setFailedIdentity(null);
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
      leaseRef.current?.release();
      leaseRef.current = null;
      clearTimer();
      readyRef.current = false;
      resolveReady();
    };
  }, [
    clearTimer,
    documentKind,
    enabled,
    flush,
    pageId,
    recoveryAttempt,
    recoveryIdentity,
    userId,
  ]);

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
    recoveryStatus,
    retryRecovery,
    notifyChange,
    flush,
    acknowledge,
    discard,
    suspend,
    resume,
    adopt,
    rebase,
    prepareSubmission,
    clearSubmitted,
  };
}
