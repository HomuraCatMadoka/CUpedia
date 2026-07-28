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

type StoredWikiDraft = WikiDraftRecord & { key: string };

function toWikiDraftRecord(stored: StoredWikiDraft): WikiDraftRecord {
  return {
    schemaVersion: stored.schemaVersion,
    userId: stored.userId,
    pageId: stored.pageId,
    sessionId: stored.sessionId,
    baseVersion: stored.baseVersion,
    contentGeneration: stored.contentGeneration,
    baseSnapshot: stored.baseSnapshot,
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

export function getWikiDraftSessionId(userId: string, pageId: string) {
  const state = (history.state ?? {}) as Record<string, unknown>;
  const existing = state[HISTORY_SESSION_KEY] as
    | { userId?: string; pageId?: string; sessionId?: string }
    | undefined;
  if (
    existing?.userId === userId &&
    existing.pageId === pageId &&
    existing.sessionId
  ) {
    return existing.sessionId;
  }
  const sessionId = crypto.randomUUID();
  history.replaceState(
    {
      ...state,
      [HISTORY_SESSION_KEY]: { userId, pageId, sessionId },
    },
    "",
    location.href,
  );
  return sessionId;
}

export async function readWikiDraft(key: string) {
  return withDraftStore("readonly", async (store) => {
    const stored = await requestResult(
      store.get(key) as IDBRequest<StoredWikiDraft | undefined>,
    );
    if (!stored) return null;
    return toWikiDraftRecord(stored);
  });
}

export async function writeWikiDraft(record: WikiDraftRecord) {
  await withDraftStore("readwrite", async (store) => {
    await requestResult(
      store.put({ ...record, key: createWikiDraftKey(record) }),
    );
  });
}

export async function deleteWikiDraft(key: string) {
  await withDraftStore("readwrite", async (store) => {
    await requestResult(store.delete(key));
  });
}

export async function acknowledgeWikiDraft(
  key: string,
  acknowledgedSnapshot: string,
  nextBase: Pick<
    WikiDraftServerState,
    "version" | "contentGeneration" | "snapshot"
  >,
) {
  await withDraftStore("readwrite", async (store) => {
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
  });
}

export async function rebaseWikiDraft(
  key: string,
  nextBase: Pick<
    WikiDraftServerState,
    "version" | "contentGeneration" | "snapshot"
  >,
) {
  await withDraftStore("readwrite", async (store) => {
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
      }),
    );
  });
}
