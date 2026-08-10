/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getWikiDraftSessionId,
  persistWikiDraftTail,
  prepareWikiDraftSubmission,
  readWikiDraft,
  rebaseWikiDraft,
  rejectWikiDraftSubmission,
  settleWikiDraftSubmission,
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
  let failNextDelete = false;
  let openCount = 0;
  let releaseFirstOpen!: () => void;
  let markFirstOpenStarted!: () => void;
  const firstOpenStarted = new Promise<void>((resolve) => {
    markFirstOpenStarted = resolve;
  });

  const database = {
    objectStoreNames: { contains: () => true },
    transaction(_storeName: string, mode: IDBTransactionMode) {
      const transaction = {} as IDBTransaction;
      const transactionRecords =
        mode === "readwrite"
          ? new Map(
              [...records].map(([key, value]) => [key, structuredClone(value)]),
            )
          : records;
      let aborted = false;
      let completionScheduled = false;
      const completeLater = () => {
        if (completionScheduled) return;
        completionScheduled = true;
        setTimeout(() => {
          if (aborted) return;
          if (mode === "readwrite") {
            records.clear();
            for (const [key, value] of transactionRecords) {
              records.set(key, structuredClone(value));
            }
          }
          transaction.oncomplete?.(new Event("complete"));
        }, 0);
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
          return request(() => transactionRecords.get(key));
        },
        put(value: Record<string, unknown>) {
          return request(() => {
            transactionRecords.set(value.key as string, structuredClone(value));
            return value.key;
          });
        },
        delete(key: string) {
          if (failNextDelete) {
            failNextDelete = false;
            throw new Error("injected IndexedDB delete failure");
          }
          return request(() => transactionRecords.delete(key));
        },
      };
      Object.assign(transaction, {
        objectStore: () => store,
        abort: () => {
          if (aborted) return;
          aborted = true;
          Object.assign(transaction, {
            error: new DOMException("Transaction aborted", "AbortError"),
          });
          queueMicrotask(() => transaction.onabort?.(new Event("abort")));
        },
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
    records,
    failNextDelete: () => {
      failNextDelete = true;
    },
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
        documentKind: "page",
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
    const tabSessionKey = "__cupediaWikiDraftSession:user-aba:page:page-a";
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
      documentKind: "page",
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
      sessionStorage.getItem(
        "__cupediaWikiDraftSession:user-hash:page:page-hash",
      ),
    ).toBe(sessionId);
    expect(history.state).toMatchObject({
      cupediaEditorNavigationGuardToken: "hash-guard",
      __cupediaWikiDraftSession: {
        userId: "user-hash",
        pageId: "page-hash",
        documentKind: "page",
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
        "__cupediaWikiDraftSession:user-before:page:page-account-change",
      ),
    ).toBeNull();
    expect(history.state.__cupediaWikiDraftSession).toMatchObject({
      userId: "user-after",
      pageId: "page-account-change",
      documentKind: "page",
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

  it("keeps private-draft and published-page sessions separate", async () => {
    const draft = await getWikiDraftSessionId(
      "user-kind",
      "page-kind",
      "draft",
    );
    const page = await getWikiDraftSessionId("user-kind", "page-kind", "page");

    expect(page).not.toBe(draft);
    expect(
      sessionStorage.getItem(
        "__cupediaWikiDraftSession:user-kind:draft:page-kind",
      ),
    ).toBe(draft);
    expect(
      sessionStorage.getItem(
        "__cupediaWikiDraftSession:user-kind:page:page-kind",
      ),
    ).toBe(page);
  });

  it("rotates a sessionStorage id copied into a duplicated tab", async () => {
    const copiedSessionId = "copied-tab-session";
    sessionStorage.setItem(
      "__cupediaWikiDraftSession:user-3:page:page-3",
      copiedSessionId,
    );
    unavailableSessionIds.add(copiedSessionId);

    const claimed = await getWikiDraftSessionId("user-3", "page-3");

    expect(claimed).not.toBe(copiedSessionId);
    expect(
      sessionStorage.getItem("__cupediaWikiDraftSession:user-3:page:page-3"),
    ).toBe(claimed);
  });

  it("migrates a legacy public-page session during reload recovery", async () => {
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
    expect(
      sessionStorage.getItem("__cupediaWikiDraftSession:user-4:page:page-4"),
    ).toBe("unlocked-copied-session");
    navigationEntries.mockRestore();
  });

  it("migrates a legacy private-draft session during reload recovery", async () => {
    Object.defineProperty(navigator, "locks", {
      value: undefined,
      configurable: true,
    });
    const navigationEntries = vi
      .spyOn(performance, "getEntriesByType")
      .mockReturnValue([{ type: "reload" } as PerformanceNavigationTiming]);
    sessionStorage.setItem(
      "__cupediaWikiDraftSession:user-private:page-private",
      "legacy-private-session",
    );

    const claimed = await getWikiDraftSessionId(
      "user-private",
      "page-private",
      "draft",
    );

    expect(claimed).toBe("legacy-private-session");
    expect(
      sessionStorage.getItem(
        "__cupediaWikiDraftSession:user-private:draft:page-private",
      ),
    ).toBe("legacy-private-session");
    expect(
      sessionStorage.getItem(
        "__cupediaWikiDraftSession:user-private:page-private",
      ),
    ).toBeNull();
    navigationEntries.mockRestore();
  });

  it("removes a stale legacy pointer when a kind-specific session already exists", async () => {
    sessionStorage.setItem(
      "__cupediaWikiDraftSession:user-current:page:page-current",
      "current-page-session",
    );
    sessionStorage.setItem(
      "__cupediaWikiDraftSession:user-current:page-current",
      "stale-legacy-session",
    );

    const claimed = await getWikiDraftSessionId(
      "user-current",
      "page-current",
      "page",
    );

    expect(claimed).toBe("current-page-session");
    expect(
      sessionStorage.getItem(
        "__cupediaWikiDraftSession:user-current:page-current",
      ),
    ).toBeNull();
  });
});

describe("wiki draft storage ordering", () => {
  it("rolls back the whole legacy migration when deleting the old key fails", async () => {
    const database = installDelayedDraftDatabase();
    const legacyKey = "user-atomic:page-atomic:session-atomic";
    const currentKey = "user-atomic:draft:page-atomic:session-atomic";
    database.records.set(legacyKey, {
      key: legacyKey,
      schemaVersion: 1,
      userId: "user-atomic",
      pageId: "page-atomic",
      sessionId: "session-atomic",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "private-server-v4",
      draftSnapshot: "private local edit",
      updatedAt: 1,
    });
    database.failNextDelete();

    const migration = readWikiDraft(currentKey, {
      legacyKey,
      documentKind: "draft",
    });
    await database.firstOpenStarted;
    database.releaseFirstOpen();

    await expect(migration).rejects.toThrow(
      "injected IndexedDB delete failure",
    );
    expect(database.records.has(legacyKey)).toBe(true);
    expect(database.records.has(currentKey)).toBe(false);

    await expect(
      readWikiDraft(currentKey, { legacyKey, documentKind: "draft" }),
    ).resolves.toMatchObject({
      schemaVersion: 2,
      documentKind: "draft",
      draftSnapshot: "private local edit",
    });
    expect(database.records.has(legacyKey)).toBe(false);
    expect(database.records.has(currentKey)).toBe(true);
  });

  it("atomically migrates a deployed legacy key into ambiguous Page recovery", async () => {
    const database = installDelayedDraftDatabase();
    const legacyKey = "user-legacy:page-legacy:session-legacy";
    const currentKey = "user-legacy:page:page-legacy:session-legacy";
    database.records.set(legacyKey, {
      key: legacyKey,
      schemaVersion: 1,
      userId: "user-legacy",
      pageId: "page-legacy",
      sessionId: "session-legacy",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      draftSnapshot: "legacy local edit",
      updatedAt: 1,
    });

    const reading = readWikiDraft(currentKey, {
      legacyKey,
      documentKind: "page",
    });
    await database.firstOpenStarted;
    database.releaseFirstOpen();

    expect(await reading).toEqual({
      schemaVersion: 2,
      userId: "user-legacy",
      pageId: "page-legacy",
      documentKind: "page",
      sessionId: "session-legacy",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submittedSnapshot: undefined,
      recoveryDisposition: "legacy-ambiguous",
      draftSnapshot: "legacy local edit",
      updatedAt: 1,
    });
    expect(database.records.has(legacyKey)).toBe(false);
    expect(database.records.get(currentKey)).toMatchObject({
      key: currentKey,
      schemaVersion: 2,
      documentKind: "page",
      recoveryDisposition: "legacy-ambiguous",
    });
  });

  it("removes a stale legacy record when the current record already exists", async () => {
    const database = installDelayedDraftDatabase();
    const legacyKey = "user-current:page-current:session-current";
    const currentKey = "user-current:page:page-current:session-current";
    database.records.set(currentKey, {
      key: currentKey,
      schemaVersion: 2,
      userId: "user-current",
      pageId: "page-current",
      documentKind: "page",
      sessionId: "session-current",
      baseVersion: 5,
      contentGeneration: 2,
      baseSnapshot: "server-v5",
      draftSnapshot: "current local edit",
      updatedAt: 2,
    });
    database.records.set(legacyKey, {
      key: legacyKey,
      schemaVersion: 1,
      userId: "user-current",
      pageId: "page-current",
      sessionId: "session-current",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      draftSnapshot: "stale local edit",
      updatedAt: 1,
    });

    const reading = readWikiDraft(currentKey, {
      legacyKey,
      documentKind: "page",
    });
    await database.firstOpenStarted;
    database.releaseFirstOpen();

    await expect(reading).resolves.toMatchObject({
      baseVersion: 5,
      draftSnapshot: "current local edit",
    });
    expect(database.records.has(currentKey)).toBe(true);
    expect(database.records.has(legacyKey)).toBe(false);
  });

  it("retains a rejected conflict draft for manual recovery", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-manual",
      pageId: "page-manual",
      documentKind: "page",
      sessionId: "session-manual",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      draftSnapshot: "rejected-local-v5",
      updatedAt: 1,
    };
    const key = "user-manual:page:page-manual:session-manual";

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

  it("does not let a delayed older rebase regress the stored baseline", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-monotonic-rebase",
      pageId: "page-monotonic-rebase",
      documentKind: "page",
      sessionId: "session-monotonic-rebase",
      baseVersion: 6,
      contentGeneration: 2,
      baseSnapshot: "server-v6",
      draftSnapshot: "local-tail",
      updatedAt: 2,
    };
    const key =
      "user-monotonic-rebase:page:page-monotonic-rebase:session-monotonic-rebase";

    const initialWrite = writeWikiDraft(record);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await initialWrite;

    await rebaseWikiDraft(key, {
      version: 5,
      contentGeneration: 2,
      snapshot: "server-v5",
    });

    await expect(readWikiDraft(key)).resolves.toMatchObject({
      baseVersion: 6,
      contentGeneration: 2,
      baseSnapshot: "server-v6",
      draftSnapshot: "local-tail",
    });
  });

  it("keeps the newer stored baseline when a draft write carries an older base", async () => {
    const database = installDelayedDraftDatabase();
    const current: WikiDraftRecord = {
      schemaVersion: 2,
      userId: "user-monotonic-write",
      pageId: "page-monotonic-write",
      documentKind: "page",
      sessionId: "session-monotonic-write",
      baseVersion: 6,
      contentGeneration: 3,
      baseSnapshot: "server-generation-3-v6",
      draftSnapshot: "first-local-tail",
      updatedAt: 1,
    };
    const key =
      "user-monotonic-write:page:page-monotonic-write:session-monotonic-write";

    const initialWrite = writeWikiDraft(current);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await initialWrite;

    await writeWikiDraft({
      ...current,
      baseVersion: 99,
      contentGeneration: 2,
      baseSnapshot: "older-generation-even-with-higher-version",
      draftSnapshot: "latest-local-tail",
      updatedAt: 2,
    });

    await expect(readWikiDraft(key)).resolves.toMatchObject({
      baseVersion: 6,
      contentGeneration: 3,
      baseSnapshot: "server-generation-3-v6",
      draftSnapshot: "latest-local-tail",
      updatedAt: 2,
    });
  });

  it("durably prepares the submitted snapshot and latest draft together", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord & {
      submitted: NonNullable<WikiDraftRecord["submitted"]>;
    } = {
      schemaVersion: 2,
      userId: "user-prepare",
      pageId: "page-prepare",
      documentKind: "page",
      sessionId: "session-prepare",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submitted: {
        id: "submission-prepare",
        snapshot: "submitted-v5",
      },
      draftSnapshot: "trailing-v6",
      updatedAt: 1,
    };
    const key = "user-prepare:page:page-prepare:session-prepare";

    const preparation = prepareWikiDraftSubmission(record);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await preparation;

    await expect(readWikiDraft(key)).resolves.toEqual(record);
  });

  it("atomically ignores an acknowledgement for an older submission", async () => {
    const database = installDelayedDraftDatabase();
    const current = {
      schemaVersion: 2,
      userId: "user-stale-settlement",
      pageId: "page-stale-settlement",
      documentKind: "page",
      sessionId: "session-stale-settlement",
      baseVersion: 5,
      contentGeneration: 2,
      baseSnapshot: "server-v5",
      submitted: {
        id: "submission-s2",
        snapshot: "submitted-s2",
      },
      draftSnapshot: "submitted-s2",
      updatedAt: 2,
    } satisfies WikiDraftRecord;
    const key =
      "user-stale-settlement:page:page-stale-settlement:session-stale-settlement";

    const preparation = prepareWikiDraftSubmission(current);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await preparation;

    await settleWikiDraftSubmission(key, {
      submissionId: "submission-s1",
      nextBase: {
        version: 6,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      },
      deleteIfClean: true,
    });

    await expect(readWikiDraft(key)).resolves.toEqual(current);
  });

  it("atomically ignores a rejection for an older submission", async () => {
    const database = installDelayedDraftDatabase();
    const current = {
      schemaVersion: 2,
      userId: "user-stale-rejection",
      pageId: "page-stale-rejection",
      documentKind: "page",
      sessionId: "session-stale-rejection",
      baseVersion: 5,
      contentGeneration: 2,
      baseSnapshot: "server-v5",
      submitted: {
        id: "submission-s2",
        snapshot: "submitted-s2",
      },
      draftSnapshot: "submitted-s2",
      updatedAt: 2,
    } satisfies WikiDraftRecord;
    const key =
      "user-stale-rejection:page:page-stale-rejection:session-stale-rejection";

    const preparation = prepareWikiDraftSubmission(current);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await preparation;

    await rejectWikiDraftSubmission(key, "submission-s1");

    await expect(readWikiDraft(key)).resolves.toEqual(current);
  });

  it("persists a trailing tail after settlement without recreating the outbox", async () => {
    const database = installDelayedDraftDatabase();
    const current = {
      schemaVersion: 2,
      userId: "user-settle-then-flush",
      pageId: "page-settle-then-flush",
      documentKind: "page",
      sessionId: "session-settle-then-flush",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submitted: {
        id: "submission-s1",
        snapshot: "submitted-s1",
      },
      draftSnapshot: "trailing-s2",
      updatedAt: 1,
    } satisfies WikiDraftRecord;
    const key =
      "user-settle-then-flush:page:page-settle-then-flush:session-settle-then-flush";

    const preparation = prepareWikiDraftSubmission(current);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await preparation;

    await settleWikiDraftSubmission(key, {
      submissionId: "submission-s1",
      nextBase: {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      },
      latestDraftSnapshot: "trailing-s2",
      deleteIfClean: false,
    });
    const tail: WikiDraftRecord = { ...current };
    delete tail.submitted;
    await persistWikiDraftTail({
      ...tail,
      baseVersion: 5,
      baseSnapshot: "submitted-s1",
      draftSnapshot: "trailing-s3",
      updatedAt: 2,
    });

    await expect(readWikiDraft(key)).resolves.toMatchObject({
      baseVersion: 5,
      baseSnapshot: "submitted-s1",
      submitted: undefined,
      submittedSnapshot: undefined,
      draftSnapshot: "trailing-s3",
    });
  });

  it("does not recreate an outbox when a later tail persist finds it missing", async () => {
    const database = installDelayedDraftDatabase();
    const prepared = {
      schemaVersion: 2,
      userId: "user-missing-outbox",
      pageId: "page-missing-outbox",
      documentKind: "page",
      sessionId: "session-missing-outbox",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submitted: {
        id: "submission-s1",
        snapshot: "submitted-s1",
      },
      draftSnapshot: "submitted-s1",
      updatedAt: 1,
    } satisfies WikiDraftRecord;
    const key =
      "user-missing-outbox:page:page-missing-outbox:session-missing-outbox";
    const preparation = prepareWikiDraftSubmission(prepared);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await preparation;
    await settleWikiDraftSubmission(key, {
      submissionId: "submission-s1",
      nextBase: {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      },
      deleteIfClean: true,
    });
    const tail: WikiDraftRecord = { ...prepared };
    delete tail.submitted;

    await expect(
      persistWikiDraftTail(
        { ...tail, draftSnapshot: "trailing-s2", updatedAt: 2 },
        { expectedSubmissionId: "submission-s1" },
      ),
    ).resolves.toEqual({ kind: "missing-outbox" });
    await expect(readWikiDraft(key)).resolves.toBeNull();
  });

  it("captures a trailing edit at atomic settlement time", async () => {
    const database = installDelayedDraftDatabase();
    const current = {
      schemaVersion: 2,
      userId: "user-lazy-tail",
      pageId: "page-lazy-tail",
      documentKind: "page",
      sessionId: "session-lazy-tail",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submitted: {
        id: "submission-s1",
        snapshot: "submitted-s1",
      },
      draftSnapshot: "submitted-s1",
      updatedAt: 1,
    } satisfies WikiDraftRecord;
    const key = "user-lazy-tail:page:page-lazy-tail:session-lazy-tail";

    const preparation = prepareWikiDraftSubmission(current);
    await database.firstOpenStarted;
    database.releaseFirstOpen();
    await preparation;

    let latestDraftSnapshot = "submitted-s1";
    const settlement = settleWikiDraftSubmission(key, {
      submissionId: "submission-s1",
      nextBase: {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-s1",
      },
      latestDraftSnapshot: () => latestDraftSnapshot,
      deleteIfClean: true,
    });
    latestDraftSnapshot = "trailing-s2";
    await settlement;

    await expect(readWikiDraft(key)).resolves.toMatchObject({
      baseVersion: 5,
      baseSnapshot: "submitted-s1",
      submitted: undefined,
      draftSnapshot: "trailing-s2",
    });
  });

  it("does not let a delayed write recreate a draft after its settlement", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord & {
      submitted: NonNullable<WikiDraftRecord["submitted"]>;
    } = {
      schemaVersion: 2,
      userId: "user-5",
      pageId: "page-5",
      documentKind: "page",
      sessionId: "session-5",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submitted: {
        id: "submission-v5",
        snapshot: "submitted-v5",
      },
      draftSnapshot: "submitted-v5",
      updatedAt: 1,
    };
    const key = "user-5:page:page-5:session-5";

    const delayedWrite = prepareWikiDraftSubmission(record);
    await database.firstOpenStarted;
    const settlement = settleWikiDraftSubmission(key, {
      submissionId: "submission-v5",
      nextBase: {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-v5",
      },
      deleteIfClean: true,
    });
    database.releaseFirstOpen();
    await Promise.all([delayedWrite, settlement]);

    expect(await readWikiDraft(key)).toBeNull();
  });

  it("rebases a trailing draft when settlement follows a delayed write", async () => {
    const database = installDelayedDraftDatabase();
    const record: WikiDraftRecord & {
      submitted: NonNullable<WikiDraftRecord["submitted"]>;
    } = {
      schemaVersion: 2,
      userId: "user-6",
      pageId: "page-6",
      documentKind: "page",
      sessionId: "session-6",
      baseVersion: 4,
      contentGeneration: 2,
      baseSnapshot: "server-v4",
      submitted: {
        id: "submission-v5",
        snapshot: "submitted-v5",
      },
      draftSnapshot: "trailing-v6",
      updatedAt: 1,
    };
    const key = "user-6:page:page-6:session-6";

    const delayedWrite = prepareWikiDraftSubmission(record);
    await database.firstOpenStarted;
    const settlement = settleWikiDraftSubmission(key, {
      submissionId: "submission-v5",
      nextBase: {
        version: 5,
        contentGeneration: 2,
        snapshot: "submitted-v5",
      },
      deleteIfClean: true,
    });
    database.releaseFirstOpen();
    await Promise.all([delayedWrite, settlement]);

    expect(await readWikiDraft(key)).toEqual({
      ...record,
      baseVersion: 5,
      baseSnapshot: "submitted-v5",
      submitted: undefined,
    });
  });
});
