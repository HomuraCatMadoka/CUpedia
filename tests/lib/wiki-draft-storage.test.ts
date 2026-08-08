/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acknowledgeWikiDraft,
  getWikiDraftSessionId,
  readWikiDraft,
  rebaseWikiDraft,
  writeWikiDraft,
} from "@/lib/wiki-draft-storage";
import type { WikiDraftRecord } from "@/lib/wiki-draft";

const unavailableSessionIds = new Set<string>();
const originalIndexedDBDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "indexedDB",
);

const locks = {
  request: vi.fn(
    async (
      name: string,
      _options: LockOptions,
      callback: (lock: Lock | null) => Promise<void> | void,
    ) =>
      callback(
        unavailableSessionIds.has(name.split(":").at(-1)!)
          ? null
          : ({ name } as Lock),
      ),
  ),
};

function installDelayedSessionLock() {
  let releaseClaim!: () => void;
  let markClaimStarted!: () => void;
  const claimStarted = new Promise<void>((resolve) => {
    markClaimStarted = resolve;
  });
  const claimGate = new Promise<void>((resolve) => {
    releaseClaim = resolve;
  });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: vi.fn(
        async (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<void> | void,
        ) => {
          markClaimStarted();
          await claimGate;
          return callback({ name: "claimed-session" } as Lock);
        },
      ),
    },
  });
  return { claimStarted, releaseClaim };
}

function installDelayedDraftDatabase() {
  const records = new Map<string, Record<string, unknown>>();
  let openCount = 0;
  let releaseFirstOpen!: () => void;
  let markFirstOpenStarted!: () => void;
  const firstOpenStarted = new Promise<void>((resolve) => {
    markFirstOpenStarted = resolve;
  });

  const database = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const transaction = {} as IDBTransaction;
      const completeLater = () => {
        setTimeout(() => transaction.oncomplete?.(new Event("complete")), 0);
      };
      const request = <T>(run: () => T) => {
        const value = {
          result: undefined as T,
          error: null,
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        queueMicrotask(() => {
          value.result = run();
          value.onsuccess?.(new Event("success"));
          completeLater();
        });
        return value as unknown as IDBRequest<T>;
      };
      const store = {
        get(key: string) {
          return request(() => records.get(key));
        },
        put(value: Record<string, unknown>) {
          return request(() => {
            records.set(value.key as string, structuredClone(value));
            return value.key;
          });
        },
        delete(key: string) {
          return request(() => records.delete(key));
        },
      };
      Object.assign(transaction, {
        objectStore: () => store,
        oncomplete: null,
        onabort: null,
        onerror: null,
        error: null,
      });
      return transaction;
    },
    close() {},
  } as unknown as IDBDatabase;

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: vi.fn(() => {
        openCount += 1;
        const request = {
          result: database,
          error: null,
          onupgradeneeded: null as ((event: Event) => void) | null,
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        const succeed = () =>
          queueMicrotask(() => request.onsuccess?.(new Event("success")));
        if (openCount === 1) {
          releaseFirstOpen = succeed;
          markFirstOpenStarted();
        } else {
          succeed();
        }
        return request as unknown as IDBOpenDBRequest;
      }),
    },
  });

  return {
    firstOpenStarted,
    releaseFirstOpen: () => releaseFirstOpen(),
  };
}

beforeEach(() => {
  Object.defineProperty(navigator, "locks", {
    value: locks,
    configurable: true,
  });
  unavailableSessionIds.clear();
  locks.request.mockClear();
  sessionStorage.clear();
  history.replaceState({}, "", "/wiki");
});

afterEach(() => {
  if (originalIndexedDBDescriptor) {
    Object.defineProperty(globalThis, "indexedDB", originalIndexedDBDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

describe("getWikiDraftSessionId", () => {
  it("preserves history fields added while the session claim is pending", async () => {
    history.replaceState({}, "", "/wiki/page-race");
    const { claimStarted, releaseClaim } = installDelayedSessionLock();

    const sessionClaim = getWikiDraftSessionId("user-race", "page-race");
    await claimStarted;
    history.replaceState(
      { cupediaEditorNavigationGuardToken: "guard-added-during-await" },
      "",
      "/wiki/page-race",
    );
    releaseClaim();
    await sessionClaim;

    expect(history.state).toMatchObject({
      cupediaEditorNavigationGuardToken: "guard-added-during-await",
      __cupediaWikiDraftSession: {
        userId: "user-race",
        pageId: "page-race",
      },
    });
  });

  it("does not write a stale page session after history moves elsewhere", async () => {
    history.replaceState({ currentPageMarker: "page-a" }, "", "/wiki/page-a");
    const { claimStarted, releaseClaim } = installDelayedSessionLock();

    const sessionClaim = getWikiDraftSessionId("user-race", "page-a");
    await claimStarted;
    history.replaceState({ currentPageMarker: "page-b" }, "", "/wiki/page-b");
    releaseClaim();
    await sessionClaim;

    expect(location.pathname).toBe("/wiki/page-b");
    expect(history.state).toEqual({ currentPageMarker: "page-b" });
  });

  it("does not let an older same-page claim overwrite a newer incarnation", async () => {
    const tabSessionKey = "__cupediaWikiDraftSession:user-aba:page-a";
    history.replaceState({}, "", "/wiki/page-a");
    const { claimStarted, releaseClaim } = installDelayedSessionLock();

    const olderClaim = getWikiDraftSessionId("user-aba", "page-a");
    await claimStarted;
    history.replaceState({}, "", "/wiki/page-b");
    history.replaceState({}, "", "/wiki/page-a");
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: locks,
    });

    const newerSessionId = await getWikiDraftSessionId("user-aba", "page-a");
    releaseClaim();
    const olderSessionId = await olderClaim;

    expect(olderSessionId).not.toBe(newerSessionId);
    expect(sessionStorage.getItem(tabSessionKey)).toBe(newerSessionId);
    expect(history.state.__cupediaWikiDraftSession).toMatchObject({
      userId: "user-aba",
      pageId: "page-a",
      sessionId: newerSessionId,
    });
  });

  it("keeps the same session when only the page hash changes during a claim", async () => {
    history.replaceState(
      { cupediaEditorNavigationGuardToken: "hash-guard" },
      "",
      "/wiki/page-hash#before",
    );
    const { claimStarted, releaseClaim } = installDelayedSessionLock();

    const sessionClaim = getWikiDraftSessionId("user-hash", "page-hash");
    await claimStarted;
    history.replaceState(
      { cupediaEditorNavigationGuardToken: "hash-guard" },
      "",
      "/wiki/page-hash#after",
    );
    releaseClaim();
    const sessionId = await sessionClaim;

    expect(
      sessionStorage.getItem("__cupediaWikiDraftSession:user-hash:page-hash"),
    ).toBe(sessionId);
    expect(history.state).toMatchObject({
      cupediaEditorNavigationGuardToken: "hash-guard",
      __cupediaWikiDraftSession: {
        userId: "user-hash",
        pageId: "page-hash",
        sessionId,
      },
    });
  });

  it("does not let an old user claim overwrite a new editor on the same URL", async () => {
    history.replaceState({}, "", "/wiki/page-account-change");
    const { claimStarted, releaseClaim } = installDelayedSessionLock();

    const oldUserClaim = getWikiDraftSessionId(
      "user-before",
      "page-account-change",
    );
    await claimStarted;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: locks,
    });

    const newUserSessionId = await getWikiDraftSessionId(
      "user-after",
      "page-account-change",
    );
    releaseClaim();
    await oldUserClaim;

    expect(
      sessionStorage.getItem(
        "__cupediaWikiDraftSession:user-before:page-account-change",
      ),
    ).toBeNull();
    expect(history.state.__cupediaWikiDraftSession).toMatchObject({
      userId: "user-after",
      pageId: "page-account-change",
      sessionId: newUserSessionId,
    });
  });

  it("reuses a page draft session after navigating away and returning", async () => {
    const first = await getWikiDraftSessionId("user-1", "page-1");

    history.replaceState({}, "", "/wiki");
    const restored = await getWikiDraftSessionId("user-1", "page-1");

    expect(restored).toBe(first);
  });

  it("keeps different pages in separate draft sessions", async () => {
    const first = await getWikiDraftSessionId("user-2", "page-1");
    const second = await getWikiDraftSessionId("user-2", "page-2");

    expect(second).not.toBe(first);
  });

  it("rotates a sessionStorage id copied into a duplicated tab", async () => {
    const copiedSessionId = "copied-tab-session";
    sessionStorage.setItem(
      "__cupediaWikiDraftSession:user-3:page-3",
      copiedSessionId,
    );
    unavailableSessionIds.add(copiedSessionId);

    const claimed = await getWikiDraftSessionId("user-3", "page-3");

    expect(claimed).not.toBe(copiedSessionId);
    expect(
      sessionStorage.getItem("__cupediaWikiDraftSession:user-3:page-3"),
    ).toBe(claimed);
  });

  it("preserves reload recovery when Web Locks is unavailable", async () => {
    Object.defineProperty(navigator, "locks", {
      value: undefined,
      configurable: true,
    });
    const navigationEntries = vi
      .spyOn(performance, "getEntriesByType")
      .mockReturnValue([{ type: "reload" } as PerformanceNavigationTiming]);
    sessionStorage.setItem(
      "__cupediaWikiDraftSession:user-4:page-4",
      "unlocked-copied-session",
    );

    const claimed = await getWikiDraftSessionId("user-4", "page-4");

    expect(claimed).toBe("unlocked-copied-session");
    navigationEntries.mockRestore();
  });
});

describe("wiki draft storage ordering", () => {
  it("retains a rejected conflict draft for manual recovery", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-manual",
      pageId: "page-manual",
      sessionId: "session-manual",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      draftSnapshot: "rejected-local-v5",
      updatedAt: 1,
    };
    const key = "user-manual:page-manual:session-manual";

    const initialWrite = writeWikiDraft(record);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await initialWrite;
    await rebaseWikiDraft(
      key,
      {
        version: 5,
        contentGeneration: 2,
        snapshot: "server-v5",
      },
      "manual",
    );

    expect(await readWikiDraft(key)).toEqual({
      ...record,
      baseVersion: 5,
      baseSnapshot: "server-v5",
      submittedSnapshot: undefined,
      recoveryDisposition: "manual",
    });
  });

  it("does not let a delayed write recreate a draft after its acknowledgement", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-5",
      pageId: "page-5",
      sessionId: "session-5",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submittedSnapshot: "submitted-v5",
      draftSnapshot: "submitted-v5",
      updatedAt: 1,
    };
    const key = "user-5:page-5:session-5";

    const delayedWrite = writeWikiDraft(record);
    await database.firstOpenStarted;
    const acknowledgement = acknowledgeWikiDraft(key, "submitted-v5", {
      version: 5,
      contentGeneration: 2,
      snapshot: "submitted-v5",
    });
    database.releaseFirstOpen();
    await Promise.all([delayedWrite, acknowledgement]);

    expect(await readWikiDraft(key)).toBeNull();
  });

  it("rebases a trailing draft when acknowledgement follows a delayed write", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord = {
      schemaVersion: 1,
      userId: "user-6",
      pageId: "page-6",
      sessionId: "session-6",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submittedSnapshot: "submitted-v5",
      draftSnapshot: "trailing-v6",
      updatedAt: 1,
    };
    const key = "user-6:page-6:session-6";

    const delayedWrite = writeWikiDraft(record);
    await database.firstOpenStarted;
    const acknowledgement = acknowledgeWikiDraft(key, "submitted-v5", {
      version: 5,
      contentGeneration: 2,
      snapshot: "submitted-v5",
    });
    database.releaseFirstOpen();
    await Promise.all([delayedWrite, acknowledgement]);

    expect(await readWikiDraft(key)).toEqual({
      ...record,
      baseVersion: 5,
      baseSnapshot: "submitted-v5",
      submittedSnapshot: undefined,
    });
  });
});
