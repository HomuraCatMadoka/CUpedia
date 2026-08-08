"use client";

import {
  createWikiDraftKey,
  resolveAcknowledgedWikiDraft,
  type WikiDraftRecord,
  type WikiDraftServerState,
} from "@/lib/wiki-draft";

const DATABASE_NAME = "cupedia-wiki-drafts";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;
const HISTORY_SESSION_KEY = "__cupediaWikiDraftSession";
const TAB_SESSION_KEY_PREFIX = "__cupediaWikiDraftSession:";
const SESSION_LOCK_PREFIX = "cupedia-wiki-draft-session:";

const claimedSessionIds = new Set<string>();
let latestSessionClaim: string | null = null;
const draftOperations = new Map<string, Promise<unknown>>();

type StoredWikiDraft = WikiDraftRecord & { key: string };

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

function toWikiDraftRecord(stored: StoredWikiDraft): WikiDraftRecord {
  return {
    schemaVersion: stored.schemaVersion,
    userId: stored.userId,
    pageId: stored.pageId,
    sessionId: stored.sessionId,
    baseVersion: stored.baseVersion,
    contentGeneration: stored.contentGeneration,
    baseSnapshot: stored.baseSnapshot,
    submittedSnapshot: stored.submittedSnapshot,
    recoveryDisposition: stored.recoveryDisposition,
    draftSnapshot: stored.draftSnapshot,
    updatedAt: stored.updatedAt,
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
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
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
    const result = await run(transaction.objectStore(STORE_NAME));
    await transactionDone(transaction);
    return result;
  } finally {
    database.close();
  }
}

export async function getWikiDraftSessionId(userId: string, pageId: string) {
  const tabSessionKey = `${TAB_SESSION_KEY_PREFIX}${userId}:${pageId}`;
  const claimToken = crypto.randomUUID();
  latestSessionClaim = claimToken;
  const sessionUrl = currentSessionDocumentUrl();
  const tabSessionId = readTabSessionId(tabSessionKey);
  const state = (history.state ?? {}) as Record<string, unknown>;
  const existing = state[HISTORY_SESSION_KEY] as
    | { userId?: string; pageId?: string; sessionId?: string }
    | undefined;
  const historySessionId =
    existing?.userId === userId &&
    existing.pageId === pageId &&
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
  // Session claiming can yield while the editor installs navigation guards or
  // another local UI layer. Merge into the latest state so this async write
  // cannot erase fields that were added after the initial read.
  const latestState = (history.state ?? {}) as Record<string, unknown>;
  history.replaceState(
    {
      ...latestState,
      [HISTORY_SESSION_KEY]: { userId, pageId, sessionId },
    },
    "",
    location.href,
  );
  return sessionId;
}

export async function readWikiDraft(key: string) {
  return serializeDraftOperation(key, () =>
    withDraftStore("readonly", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (!stored) return null;
      return toWikiDraftRecord(stored);
    }),
  );
}

export async function writeWikiDraft(record: WikiDraftRecord) {
  const key = createWikiDraftKey(record);
  await serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      await requestResult(
        store.put({
          ...record,
          ...(stored?.submittedSnapshot
            ? { submittedSnapshot: stored.submittedSnapshot }
            : {}),
          key,
        }),
      );
    }),
  );
}

export async function markWikiDraftSubmitted(key: string, snapshot: string) {
  await serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (!stored) return;
      await requestResult(
        store.put({ ...stored, submittedSnapshot: snapshot, key }),
      );
    }),
  );
}

export async function clearWikiDraftSubmitted(key: string) {
  await serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (!stored?.submittedSnapshot) return;
      delete stored.submittedSnapshot;
      await requestResult(store.put(stored));
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

export async function acknowledgeWikiDraft(
  key: string,
  acknowledgedSnapshot: string,
  nextBase: Pick<
    WikiDraftServerState,
    "version" | "contentGeneration" | "snapshot"
  >,
) {
  await serializeDraftOperation(key, () =>
    withDraftStore("readwrite", async (store) => {
      const stored = await requestResult(
        store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
      );
      if (!stored) return;
      const next = resolveAcknowledgedWikiDraft(
        toWikiDraftRecord(stored),
        acknowledgedSnapshot,
        nextBase,
      );
      if (next) {
        await requestResult(store.put({ ...next, key }));
      } else {
        await requestResult(store.delete(key));
      }
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
      await requestResult(
        store.put({
          ...stored,
          baseVersion: nextBase.version,
          contentGeneration: nextBase.contentGeneration,
          baseSnapshot: nextBase.snapshot,
          ...(recoveryDisposition ? { recoveryDisposition } : {}),
        }),
      );
    }),
  );
}
