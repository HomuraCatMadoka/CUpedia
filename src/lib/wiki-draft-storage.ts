"use client";

import {
  compareWikiDraftBaselines,
  createLegacyWikiDraftKey,
  createWikiDraftKey,
  WIKI_DRAFT_SCHEMA_VERSION,
  type LegacyWikiDraftRecord,
  type WikiDraftRecord,
  type WikiDraftServerState,
} from "./wiki-draft";
import {
  rejectWikiEditSessionSubmission,
  settleWikiEditSessionSubmission,
} from "./wiki-edit-session";
import type { WikiDocumentKind } from "./wiki-sync";

const DATABASE_NAME = "cupedia-wiki-drafts";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;
const HISTORY_SESSION_KEY = "__cupediaWikiDraftSession";
const TAB_SESSION_KEY_PREFIX = "__cupediaWikiDraftSession:";
const SESSION_LOCK_PREFIX = "cupedia-wiki-draft-session:";

const claimedSessionIds = new Set<string>();
let latestSessionClaim: string | null = null;
const draftOperations = new Map<string, Promise<unknown>>();

type StoredWikiDraft = Omit<
  WikiDraftRecord,
  "schemaVersion" | "documentKind"
> & {
  key: string;
  schemaVersion: number;
  documentKind?: WikiDocumentKind;
};

export interface WikiDraftLegacyMigration {
  legacyKey: string;
  documentKind: WikiDocumentKind;
}

type WikiDraftTailRecord = Omit<
  WikiDraftRecord,
  "submitted" | "submittedSnapshot"
>;

interface WikiDraftTailExpectation {
  expectedSubmissionId?: string;
}

function serializeDraftOperation<T>(key: string, run: () => Promise<T>) {
  const previous = draftOperations.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(run);
  draftOperations.set(key, current);
  return current.finally(() => {
    if (draftOperations.get(key) === current) draftOperations.delete(key);
  });
}

function readTabSessionId(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTabSessionId(key: string, sessionId: string) {
  try {
    sessionStorage.setItem(key, sessionId);
  } catch {
    // History state remains the fallback when storage is unavailable.
  }
}

function removeTabSessionId(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // The document-kind key and history state still fence future sessions.
  }
}

function currentSessionDocumentUrl() {
  const url = new URL(location.href);
  url.hash = "";
  return url.href;
}

async function tryClaimSessionId(sessionId: string) {
  if (claimedSessionIds.has(sessionId)) return true;
  if (!navigator.locks) return false;

  return new Promise<boolean>((resolve, reject) => {
    void navigator.locks
      .request(
        `${SESSION_LOCK_PREFIX}${sessionId}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          claimedSessionIds.add(sessionId);
          resolve(true);
          // Hold ownership for this document's lifetime. The browser releases
          // the lock automatically when the document closes or reloads.
          await new Promise<void>(() => {});
        },
      )
      .catch(reject);
  });
}

async function claimSessionId(candidate: string) {
  if (!navigator.locks) {
    if (claimedSessionIds.has(candidate)) return candidate;
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const sessionId =
      navigation?.type === "reload" || navigation?.type === "back_forward"
        ? candidate
        : crypto.randomUUID();
    claimedSessionIds.add(sessionId);
    return sessionId;
  }
  if (await tryClaimSessionId(candidate)) return candidate;
  let sessionId = crypto.randomUUID();
  while (!(await tryClaimSessionId(sessionId))) {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

function toWikiDraftRecord(
  stored: StoredWikiDraft,
): WikiDraftRecord | LegacyWikiDraftRecord | null {
  const fields = {
    userId: stored.userId,
    pageId: stored.pageId,
    sessionId: stored.sessionId,
    baseVersion: stored.baseVersion,
    contentGeneration: stored.contentGeneration,
    baseSnapshot: stored.baseSnapshot,
    submittedSnapshot: stored.submittedSnapshot,
    submitted: stored.submitted,
    recoveryDisposition: stored.recoveryDisposition,
    draftSnapshot: stored.draftSnapshot,
    updatedAt: stored.updatedAt,
  };
  if (stored.schemaVersion === 1 && stored.documentKind === undefined) {
    return { ...fields, schemaVersion: 1 };
  }
  if (
    stored.schemaVersion !== WIKI_DRAFT_SCHEMA_VERSION ||
    stored.documentKind === undefined
  ) {
    return null;
  }
  return {
    ...fields,
    schemaVersion: WIKI_DRAFT_SCHEMA_VERSION,
    documentKind: stored.documentKind,
  };
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new DOMException("IndexedDB transaction aborted", "AbortError"),
      );
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new DOMException("IndexedDB transaction failed", "UnknownError"),
      );
  });
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDraftStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
) {
  const database = await openDraftDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const completion = transactionDone(transaction);
    try {
      const result = await run(transaction.objectStore(STORE_NAME));
      await completion;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have aborted because a request failed.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}

export async function getWikiDraftSessionId(
  userId: string,
  pageId: string,
  documentKind: WikiDocumentKind = "page",
) {
  const tabSessionKey = `${TAB_SESSION_KEY_PREFIX}${userId}:${documentKind}:${pageId}`;
  const legacyTabSessionKey = `${TAB_SESSION_KEY_PREFIX}${userId}:${pageId}`;
  const claimToken = crypto.randomUUID();
  latestSessionClaim = claimToken;
  const sessionUrl = currentSessionDocumentUrl();
  const currentTabSessionId = readTabSessionId(tabSessionKey);
  const legacyTabSessionId = readTabSessionId(legacyTabSessionKey);
  const tabSessionId = currentTabSessionId ?? legacyTabSessionId;
  const state = (history.state ?? {}) as Record<string, unknown>;
  const existing = state[HISTORY_SESSION_KEY] as
    | {
        userId?: string;
        pageId?: string;
        documentKind?: WikiDocumentKind;
        sessionId?: string;
      }
    | undefined;
  const historySessionId =
    existing?.userId === userId &&
    existing.pageId === pageId &&
    (existing.documentKind === documentKind ||
      existing.documentKind === undefined) &&
    existing.sessionId
      ? existing.sessionId
      : null;
  const sessionId = await claimSessionId(
    tabSessionId ?? historySessionId ?? crypto.randomUUID(),
  );
  // A superseded editor may finish after the tab moved elsewhere or after a
  // newer incarnation of the same URL mounted. It cannot publish its session
  // into either shared storage boundary.
  const isLatestClaim = latestSessionClaim === claimToken;
  if (currentSessionDocumentUrl() !== sessionUrl || !isLatestClaim) {
    if (isLatestClaim) latestSessionClaim = null;
    return sessionId;
  }
  latestSessionClaim = null;
  writeTabSessionId(tabSessionKey, sessionId);
  if (legacyTabSessionId) {
    removeTabSessionId(legacyTabSessionKey);
  }
  // Session claiming can yield while the editor installs navigation guards or
  // another local UI layer. Merge into the latest state so this async write
  // cannot erase fields that were added after the initial read.
  const latestState = (history.state ?? {}) as Record<string, unknown>;
  history.replaceState(
    {
      ...latestState,
      [HISTORY_SESSION_KEY]: { userId, pageId, documentKind, sessionId },
    },
    "",
    location.href,
  );
  return sessionId;
}

export async function readWikiDraft(
  key: string,
  legacyMigration?: WikiDraftLegacyMigration,
) {
  return serializeDraftOperation(key, () =>
    withDraftStore(
      legacyMigration ? "readwrite" : "readonly",
      async (store) => {
        const stored = await requestResult(
          store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
        );
        if (stored) {
          const record = toWikiDraftRecord(stored);
          if (!record || record.documentKind === undefined) {
            throw new Error("Unsupported wiki draft record at the current key");
          }
          if (createWikiDraftKey(record) !== key) {
            throw new Error(
              "Wiki draft record identity does not match its key",
            );
          }
          if (legacyMigration) {
            await requestResult(store.delete(legacyMigration.legacyKey));
          }
          return record;
        }
        if (!legacyMigration) return null;

        const legacyStored = await requestResult(
          store.get(legacyMigration.legacyKey) as IDBRequest<
            StoredWikiDraft | undefined
          >,
        );
        if (!legacyStored) return null;
        const legacyRecord = toWikiDraftRecord(legacyStored);
        if (!legacyRecord) {
          throw new Error("Unsupported legacy wiki draft record");
        }
        if (
          createLegacyWikiDraftKey(legacyRecord) !== legacyMigration.legacyKey
        ) {
          throw new Error("Legacy wiki draft identity does not match its key");
        }

        const migratedRecord: WikiDraftRecord =
          legacyRecord.documentKind === undefined
            ? {
                ...legacyRecord,
                schemaVersion: WIKI_DRAFT_SCHEMA_VERSION,
                documentKind: legacyMigration.documentKind,
                ...(legacyMigration.documentKind === "page"
                  ? { recoveryDisposition: "legacy-ambiguous" as const }
                  : {}),
              }
            : legacyRecord;
        if (
          migratedRecord.documentKind !== legacyMigration.documentKind ||
          createWikiDraftKey(migratedRecord) !== key
        ) {
          throw new Error(
            "Migrated wiki draft identity does not match its key",
          );
        }

        await requestResult(store.put({ ...migratedRecord, key }));
        await requestResult(store.delete(legacyMigration.legacyKey));
        return migratedRecord;
      },
    ),
  );
}

export async function persistWikiDraftTail(
  record: WikiDraftTailRecord,
  expectation: WikiDraftTailExpectation = {},
) {
  const key = createWikiDraftKey(record);
  return serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (
        expectation.expectedSubmissionId !== undefined &&
        stored?.submitted?.id !== expectation.expectedSubmissionId
      ) {
        return { kind: "missing-outbox" as const };
      }
      const retainsStoredBaseline =
        stored !== undefined &&
        compareWikiDraftBaselines(
          {
            version: record.baseVersion,
            contentGeneration: record.contentGeneration,
            snapshot: record.baseSnapshot,
          },
          {
            version: stored.baseVersion,
            contentGeneration: stored.contentGeneration,
            snapshot: stored.baseSnapshot,
          },
        ) < 0;
      const next: StoredWikiDraft = {
        ...record,
        ...(retainsStoredBaseline
          ? {
              baseVersion: stored.baseVersion,
              contentGeneration: stored.contentGeneration,
              baseSnapshot: stored.baseSnapshot,
            }
          : {}),
        key,
      };
      if (stored) {
        // A normal draft flush may update the local tail, but only the
        // submission prepare/settle operations own the durable outbox.
        if (stored.submitted) {
          next.submitted = stored.submitted;
        } else if (stored.submittedSnapshot !== undefined) {
          next.submittedSnapshot = stored.submittedSnapshot;
        }
      }
      await requestResult(store.put(next));
      return { kind: "persisted" as const };
    }),
  );
}

export async function writeWikiDraft(record: WikiDraftRecord) {
  const submitted = record.submitted;
  const tail = { ...record };
  delete tail.submitted;
  delete tail.submittedSnapshot;
  const result = await persistWikiDraftTail(
    tail,
    submitted ? { expectedSubmissionId: submitted.id } : undefined,
  );
  if (result.kind === "missing-outbox") {
    throw new Error("WIKI_DRAFT_OUTBOX_MISSING");
  }
}

export async function prepareWikiDraftSubmission(
  record: WikiDraftRecord & {
    submitted: NonNullable<WikiDraftRecord["submitted"]>;
  },
) {
  const key = createWikiDraftKey(record);
  await serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      await requestResult(store.put({ ...record, key }));
    }),
  );
}

export async function settleWikiDraftSubmission(
  key: string,
  settlement: Omit<
    Parameters<typeof settleWikiEditSessionSubmission>[1],
    "deleteIfClean" | "latestDraftSnapshot"
  > & {
    deleteIfClean: boolean | (() => boolean);
    latestDraftSnapshot?: string | (() => string | undefined);
  },
) {
  return serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (!stored) return { kind: "missing" as const };
      const record = toWikiDraftRecord(stored);
      if (!record?.documentKind) return { kind: "missing" as const };
      const result = settleWikiEditSessionSubmission(record, {
        ...settlement,
        latestDraftSnapshot:
          typeof settlement.latestDraftSnapshot === "function"
            ? settlement.latestDraftSnapshot()
            : settlement.latestDraftSnapshot,
        deleteIfClean:
          typeof settlement.deleteIfClean === "function"
            ? settlement.deleteIfClean()
            : settlement.deleteIfClean,
      });
      if (result.kind === "stale") return result;
      if (result.record) {
        await requestResult(store.put({ ...result.record, key }));
      } else {
        await requestResult(store.delete(key));
      }
      return result;
    }),
  );
}

export async function rejectWikiDraftSubmission(
  key: string,
  submissionId: string,
) {
  return serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (!stored) return { kind: "missing" as const };
      const record = toWikiDraftRecord(stored);
      if (!record?.documentKind) return { kind: "missing" as const };
      const result = rejectWikiEditSessionSubmission(record, submissionId);
      if (result.kind === "stale") return result;
      await requestResult(store.put({ ...result.record, key }));
      return result;
    }),
  );
}

export async function deleteWikiDraft(key: string) {
  await serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      await requestResult(store.delete(key));
    }),
  );
}

export async function rebaseWikiDraft(
  key: string,
  nextBase: Pick<
    WikiDraftServerState,
    "version" | "contentGeneration" | "snapshot"
  >,
  recoveryDisposition?: WikiDraftRecord["recoveryDisposition"],
) {
  await serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (!stored) return;
      const advancesBaseline =
        compareWikiDraftBaselines(nextBase, {
          version: stored.baseVersion,
          contentGeneration: stored.contentGeneration,
          snapshot: stored.baseSnapshot,
        }) >= 0;
      await requestResult(
        store.put({
          ...stored,
          ...(advancesBaseline
            ? {
                baseVersion: nextBase.version,
                contentGeneration: nextBase.contentGeneration,
                baseSnapshot: nextBase.snapshot,
              }
            : {}),
          ...(recoveryDisposition ? { recoveryDisposition } : {}),
        }),
      );
    }),
  );
}
