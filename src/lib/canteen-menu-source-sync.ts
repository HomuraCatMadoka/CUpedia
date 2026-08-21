import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteenMenuSyncSnapshots,
} from "@/db/schema";
import {
  and,
  eq,
  getTableColumns,
  inArray,
  lt,
  notExists,
  sql,
} from "drizzle-orm";
import { lockCanteenMenuMutationForSource } from "./canteen-menu-mutation-lock";
import { fetchMenuFromProvider } from "./canteen-menu-source-adapters";
import {
  isReviewRequiredMenuSyncCode,
  listMenuSourceScheduleCandidates,
  recheckMenuSourceScheduleCandidate,
} from "./canteen-menu-sync-scheduler";
import { readMenuSyncDatabaseNow } from "./canteen-menu-sync-clock";
import type { MenuIdentityObservation } from "./canteen-menu-sync-observation";
import { insertMenuSyncSnapshot } from "./canteen-menu-sync-snapshots";
import {
  applyRecurringMenuProjection,
  type LockedMenuSource,
  type MenuSyncTransaction,
} from "./canteen-menu-sync-store";
import type { MenuSyncInput } from "./canteen-types";
import { menuSyncWindowAt } from "./canteen-menu-sync-window";
import { normalizeSyncErrorCode } from "./sync-error-code";

const MAX_CONCURRENCY = 2;
const CLAIM_DURATION_MS = 2 * 60 * 1_000;
const MAX_ERROR_LENGTH = 1_000;
const MENU_SYNC_RETENTION_BATCH_SIZE = 100;

declare const normalizedSyncCode: unique symbol;
export type NormalizedSyncCode = string & {
  readonly [normalizedSyncCode]: true;
};

type MenuSourceSyncResultBase = {
  sourceId: string;
  canteenId?: string;
  runId?: string;
};

export type MenuSourceSyncResult = MenuSourceSyncResultBase &
  (
    | {
        status: "applied";
        code: "MENU_SYNC_APPLIED";
        itemCount: number;
      }
    | {
        status: "unchanged";
        code: "MENU_SYNC_UNCHANGED";
        itemCount: number;
      }
    | {
        status: "already-running";
        code: "MENU_SYNC_ALREADY_RUNNING";
      }
    | {
        status: "blocked";
        code:
          | "MENU_SYNC_CONFLICT"
          | "MENU_SYNC_IDENTITY_CHURN"
          | "MENU_SYNC_SUSPICIOUS_DROP";
      }
    | { status: "provider-failure"; code: NormalizedSyncCode }
    | {
        status: "source-unavailable";
        code: "MENU_SOURCE_NOT_FOUND" | "MENU_SOURCE_DISABLED";
      }
    | { status: "internal-failure"; code: NormalizedSyncCode }
    | { status: "superseded"; code: "MENU_SYNC_SUPERSEDED" }
  );

export type NextDueMenuSourceSyncResult =
  | { disposition: "no-work"; window: string }
  | {
      disposition: "continue";
      window: string;
      sourceId: string;
      result: MenuSourceSyncResult;
    }
  | {
      disposition: "retry-later" | "stop-for-review";
      window: string;
      sourceId: string;
      code: NormalizedSyncCode;
      result?: MenuSourceSyncResult;
    };

type MenuSourceRow = typeof canteenMenuSources.$inferSelect;
const issuedClaims = new WeakSet<object>();
declare const menuSourceClaimBrand: unique symbol;

type MenuSourceClaim = {
  readonly source: Readonly<MenuSourceRow>;
  readonly runId: string;
  readonly sourceFingerprint: string;
  readonly [menuSourceClaimBrand]: true;
};

type MenuSourceClaimResult =
  | { status: "claimed"; claim: MenuSourceClaim }
  | { status: "already-running"; runId: string; canteenId: string }
  | {
      status: "unavailable";
      code: "MENU_SOURCE_NOT_FOUND" | "MENU_SOURCE_DISABLED";
    };

type ClaimedRunFinalization =
  | {
      kind: "success";
      status: "applied" | "unchanged";
      snapshotHash: string;
      itemCount: number;
      createdCount: number;
      updatedCount: number;
      deactivatedCount: number;
      observation: MenuIdentityObservation;
    }
  | {
      kind: "error";
      code: string;
      message: string;
      snapshotHash?: string;
      itemCount?: number;
      observation: MenuIdentityObservation | Record<string, never>;
    };

function menuSourceFingerprint(source: Readonly<MenuSourceRow>): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: source.id,
        canteenId: source.canteenId,
        provider: source.provider,
        externalOwnerId: source.externalOwnerId,
        externalStoreId: source.externalStoreId,
        config: source.config,
        enabled: source.enabled,
      }),
    )
    .digest("hex");
}

function freezeJson(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeJson(child);
}

function issueMenuSourceClaim(
  source: MenuSourceRow,
  runId: string,
): MenuSourceClaim {
  const config = structuredClone(source.config);
  freezeJson(config);
  const sourceSnapshot = Object.freeze({ ...source, config });
  const claim = Object.freeze({
    source: sourceSnapshot,
    runId,
    sourceFingerprint: menuSourceFingerprint(sourceSnapshot),
  }) as MenuSourceClaim;
  issuedClaims.add(claim);
  return claim;
}

function isCurrentClaim(
  source: LockedMenuSource,
  claim: MenuSourceClaim,
): boolean {
  return (
    issuedClaims.has(claim) &&
    source.syncClaimToken === claim.runId &&
    !source.claimExpired &&
    menuSourceFingerprint(source) === claim.sourceFingerprint
  );
}

async function selectLockedSource(
  tx: MenuSyncTransaction,
  sourceId: string,
  skipLocked = false,
): Promise<LockedMenuSource | undefined> {
  const query = tx
    .select({
      ...getTableColumns(canteenMenuSources),
      databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
    })
    .from(canteenMenuSources)
    .where(eq(canteenMenuSources.id, sourceId));
  const [source] = await query.for(
    "update",
    skipLocked
      ? { of: canteenMenuSources, skipLocked: true }
      : { of: canteenMenuSources },
  );
  return source;
}

async function pruneExpiredMenuSyncEvidence(
  sourceId: string,
  executor: Pick<MenuSyncTransaction, "delete"> = db,
): Promise<void> {
  await executor
    .delete(canteenMenuSyncSnapshots)
    .where(
      and(
        eq(canteenMenuSyncSnapshots.menuSourceId, sourceId),
        lt(
          canteenMenuSyncSnapshots.observedAt,
          sql`now() - interval '30 days'`,
        ),
      ),
    );
  await executor
    .delete(canteenMenuSyncRuns)
    .where(
      and(
        eq(canteenMenuSyncRuns.menuSourceId, sourceId),
        inArray(
          canteenMenuSyncRuns.status,
          CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
        ),
        lt(canteenMenuSyncRuns.completedAt, sql`now() - interval '30 days'`),
        notExists(
          db
            .select({ runId: canteenMenuSyncSnapshots.runId })
            .from(canteenMenuSyncSnapshots)
            .where(eq(canteenMenuSyncSnapshots.runId, canteenMenuSyncRuns.id)),
        ),
      ),
    );
}

async function pruneExpiredMenuSyncEvidenceBatch(
  executor: Pick<MenuSyncTransaction, "execute">,
): Promise<void> {
  await executor.execute(sql`
    with expired_snapshots as (
      select snapshot.run_id
      from ${canteenMenuSyncSnapshots} as snapshot
      where snapshot.observed_at < now() - interval '30 days'
      order by snapshot.observed_at, snapshot.run_id
      limit ${MENU_SYNC_RETENTION_BATCH_SIZE}
      for update skip locked
    )
    delete from ${canteenMenuSyncSnapshots} as snapshot
    using expired_snapshots as expired
    where snapshot.run_id = expired.run_id
  `);
  await executor.execute(sql`
    with expired_runs as (
      select run.id
      from ${canteenMenuSyncRuns} as run
      where run.status in ('applied', 'unchanged', 'failed')
        and run.completed_at < now() - interval '30 days'
        and not exists (
          select 1
          from ${canteenMenuSyncSnapshots} as snapshot
          where snapshot.run_id = run.id
        )
      order by run.completed_at, run.id
      limit ${MENU_SYNC_RETENTION_BATCH_SIZE}
      for update skip locked
    )
    delete from ${canteenMenuSyncRuns} as run
    using expired_runs as expired
    where run.id = expired.id
  `);
}

async function acquireMenuSourceClaim(
  sourceId: string,
): Promise<MenuSourceClaimResult> {
  await pruneExpiredMenuSyncEvidence(sourceId);

  return db.transaction(async (tx) => {
    const source = await selectLockedSource(tx, sourceId);
    if (!source)
      return { status: "unavailable", code: "MENU_SOURCE_NOT_FOUND" };
    return claimLockedMenuSource(tx, source, source.databaseNow);
  });
}

async function claimLockedMenuSource(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  now: Date,
): Promise<MenuSourceClaimResult> {
  if (!source.enabled) {
    return { status: "unavailable", code: "MENU_SOURCE_DISABLED" };
  }
  if (
    source.syncClaimToken &&
    source.syncClaimExpiresAt &&
    source.syncClaimExpiresAt > now
  ) {
    return {
      status: "already-running",
      runId: source.syncClaimToken,
      canteenId: source.canteenId,
    };
  }

  const runId = randomUUID();
  if (source.syncClaimToken) {
    await tx
      .update(canteenMenuSyncRuns)
      .set({
        status: "failed",
        errorCode: "MENU_SYNC_SUPERSEDED",
        error: "MENU_SYNC_SUPERSEDED",
        completedAt: now,
      })
      .where(
        and(
          eq(canteenMenuSyncRuns.id, source.syncClaimToken),
          eq(canteenMenuSyncRuns.status, "running"),
        ),
      );
  }
  const [claimedSource] = await tx
    .update(canteenMenuSources)
    .set({
      lastAttemptId: runId,
      lastAttemptAt: now,
      syncClaimToken: runId,
      syncClaimExpiresAt: new Date(now.getTime() + CLAIM_DURATION_MS),
      updatedAt: now,
    })
    .where(eq(canteenMenuSources.id, source.id))
    .returning();
  await tx.insert(canteenMenuSyncRuns).values({
    id: runId,
    menuSourceId: source.id,
    startedAt: now,
  });
  return {
    status: "claimed",
    claim: issueMenuSourceClaim(claimedSource, runId),
  };
}

type NextDueMenuSourceClaimResult =
  | {
      status: "claimed";
      window: string;
      attemptNumber: number;
      claim: MenuSourceClaim;
    }
  | { status: "no-work"; window: string }
  | {
      status: "retry-later" | "stop-for-review";
      window: string;
      sourceId: string;
      code: string;
    };

async function acquireNextDueMenuSourceClaim(): Promise<NextDueMenuSourceClaimResult> {
  return db.transaction(async (tx) => {
    await pruneExpiredMenuSyncEvidenceBatch(tx);
    const databaseNow = await readMenuSyncDatabaseNow(tx);
    const window = menuSyncWindowAt(databaseNow);
    const candidates = await listMenuSourceScheduleCandidates(
      tx,
      window,
      databaseNow,
    );
    let fallback:
      | {
          status: "retry-later" | "stop-for-review";
          window: string;
          sourceId: string;
          code: string;
        }
      | undefined;
    for (const candidate of candidates) {
      const source = await selectLockedSource(tx, candidate.sourceId, true);
      if (!source) continue;
      const current = await recheckMenuSourceScheduleCandidate(
        tx,
        window,
        source.id,
        databaseNow,
      );
      if (!current) continue;
      if (current.state !== "claimable") {
        const nextFallback = {
          status: current.state,
          window: window.key,
          sourceId: current.sourceId,
          code: current.code,
        } as const;
        if (
          !fallback ||
          (fallback.status === "stop-for-review" &&
            nextFallback.status === "retry-later")
        ) {
          fallback = nextFallback;
        }
        continue;
      }
      const claimed = await claimLockedMenuSource(tx, source, databaseNow);
      if (claimed.status !== "claimed") {
        throw new Error("MENU_SYNC_CLAIM_INCONSISTENT");
      }
      return {
        status: "claimed",
        window: window.key,
        attemptNumber: current.attemptNumber,
        claim: claimed.claim,
      };
    }
    return fallback ?? { status: "no-work", window: window.key };
  });
}

async function finalizeLockedClaimedRun(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  claim: MenuSourceClaim,
  outcome: ClaimedRunFinalization,
  now: Date,
): Promise<void> {
  if (!isCurrentClaim(source, claim)) {
    throw new Error("MENU_SYNC_SUPERSEDED");
  }
  const { sourceValues, runValues } =
    outcome.kind === "success"
      ? {
          sourceValues: {
            lastSuccessAt: now,
            lastSnapshotHash: outcome.snapshotHash,
            observedState: "available" as const,
            lastErrorCode: null,
            lastError: null,
            syncClaimToken: null,
            syncClaimExpiresAt: null,
            updatedAt: now,
          },
          runValues: {
            status: outcome.status,
            snapshotHash: outcome.snapshotHash,
            itemCount: outcome.itemCount,
            createdCount: outcome.createdCount,
            updatedCount: outcome.updatedCount,
            deactivatedCount: outcome.deactivatedCount,
            observation: outcome.observation,
            completedAt: now,
          },
        }
      : {
          sourceValues: {
            observedState: "error" as const,
            lastErrorCode: outcome.code,
            lastError: outcome.message,
            syncClaimToken: null,
            syncClaimExpiresAt: null,
            updatedAt: now,
          },
          runValues: {
            status: "failed" as const,
            snapshotHash: outcome.snapshotHash,
            itemCount: outcome.itemCount,
            observation: outcome.observation,
            errorCode: outcome.code,
            error: outcome.message,
            completedAt: now,
          },
        };

  const [updatedSource] = await tx
    .update(canteenMenuSources)
    .set(sourceValues)
    .where(
      and(
        eq(canteenMenuSources.id, source.id),
        eq(canteenMenuSources.syncClaimToken, claim.runId),
      ),
    )
    .returning({ id: canteenMenuSources.id });
  const [updatedRun] = await tx
    .update(canteenMenuSyncRuns)
    .set(runValues)
    .where(
      and(
        eq(canteenMenuSyncRuns.id, claim.runId),
        eq(canteenMenuSyncRuns.status, "running"),
      ),
    )
    .returning({ id: canteenMenuSyncRuns.id });
  if (!updatedSource || !updatedRun) {
    throw new Error(
      outcome.kind === "error"
        ? "MENU_SYNC_FINALIZATION_INCONSISTENT"
        : "MENU_SYNC_SUPERSEDED",
    );
  }
}

async function finalizeClaimedRun(
  claim: MenuSourceClaim,
  outcome: ClaimedRunFinalization,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const source = await selectLockedSource(tx, claim.source.id);
    if (!source || !isCurrentClaim(source, claim)) return false;
    const databaseNow = await readMenuSyncDatabaseNow(tx);
    await finalizeLockedClaimedRun(tx, source, claim, outcome, databaseNow);
    return true;
  });
}

function snapshotHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN_SYNC_ERROR";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function errorCode(error: unknown): NormalizedSyncCode {
  return normalizeSyncErrorCode(
    error instanceof Error ? error.message : null,
  ) as NormalizedSyncCode;
}

function supersededResult(claim: MenuSourceClaim): MenuSourceSyncResult {
  return {
    sourceId: claim.source.id,
    canteenId: claim.source.canteenId,
    runId: claim.runId,
    status: "superseded",
    code: "MENU_SYNC_SUPERSEDED",
  };
}

async function finalizeFailureResult(
  claim: MenuSourceClaim,
  error: unknown,
  status: "provider-failure" | "internal-failure",
  snapshot?: { hash: string; itemCount: number },
): Promise<MenuSourceSyncResult> {
  const code = errorCode(error);
  if (code === "MENU_SYNC_SUPERSEDED") {
    return supersededResult(claim);
  }
  const finalized = await finalizeClaimedRun(claim, {
    kind: "error",
    code,
    message: safeError(error),
    snapshotHash: snapshot?.hash,
    itemCount: snapshot?.itemCount,
    observation: {},
  });
  if (!finalized) {
    return supersededResult(claim);
  }
  return {
    sourceId: claim.source.id,
    canteenId: claim.source.canteenId,
    runId: claim.runId,
    status,
    code,
  };
}

async function commitClaimedRecurringMenuSync(
  claim: MenuSourceClaim,
  input: MenuSyncInput,
  snapshot: { hash: string; itemCount: number },
) {
  return db.transaction(async (tx) => {
    const lockedCanteenId = await lockCanteenMenuMutationForSource(
      tx,
      claim.source.id,
    );
    if (!lockedCanteenId) throw new Error("MENU_SYNC_SUPERSEDED");
    const source = await selectLockedSource(tx, claim.source.id);
    if (
      !source ||
      !isCurrentClaim(source, claim) ||
      source.canteenId !== lockedCanteenId
    ) {
      throw new Error("MENU_SYNC_SUPERSEDED");
    }

    const projection = await applyRecurringMenuProjection(tx, source, input);
    const databaseNow = await readMenuSyncDatabaseNow(tx);
    if (projection.status === "blocked") {
      const code = projection.evaluation.blockingDecision.code;
      if (!code) throw new Error("MENU_SYNC_BLOCKED_WITHOUT_CODE");
      await finalizeLockedClaimedRun(
        tx,
        source,
        claim,
        {
          kind: "error",
          code,
          message: code,
          snapshotHash: snapshot.hash,
          itemCount: snapshot.itemCount,
          observation: projection.evaluation.identityObservation,
        },
        databaseNow,
      );
      return projection;
    }
    await insertMenuSyncSnapshot(tx, {
      runId: claim.runId,
      sourceId: source.id,
      snapshotHash: snapshot.hash,
      observedAt: databaseNow,
      input,
    });
    await finalizeLockedClaimedRun(
      tx,
      source,
      claim,
      {
        kind: "success",
        status: projection.status,
        snapshotHash: snapshot.hash,
        itemCount: snapshot.itemCount,
        createdCount: projection.createdCount,
        updatedCount: projection.updatedCount,
        deactivatedCount: projection.deactivatedCount,
        observation: projection.evaluation.identityObservation,
      },
      databaseNow,
    );
    return projection;
  });
}

async function executeClaimedMenuSourceSync(
  claim: MenuSourceClaim,
): Promise<MenuSourceSyncResult> {
  const { source, runId } = claim;
  let input: MenuSyncInput;
  try {
    const fetched = await fetchMenuFromProvider(source);
    input = { ...fetched, takeOverLegacyItems: false };
  } catch (error) {
    return finalizeFailureResult(claim, error, "provider-failure");
  }

  const snapshot = {
    hash: snapshotHash(input),
    itemCount: input.items.length,
  };
  try {
    const committed = await commitClaimedRecurringMenuSync(
      claim,
      input,
      snapshot,
    );
    if (committed.status === "blocked") {
      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        runId,
        status: "blocked",
        code: committed.evaluation.blockingDecision.code!,
      };
    }
    return committed.status === "applied"
      ? {
          sourceId: source.id,
          canteenId: source.canteenId,
          runId,
          status: "applied",
          code: "MENU_SYNC_APPLIED",
          itemCount: input.items.length,
        }
      : {
          sourceId: source.id,
          canteenId: source.canteenId,
          runId,
          status: "unchanged",
          code: "MENU_SYNC_UNCHANGED",
          itemCount: input.items.length,
        };
  } catch (error) {
    return finalizeFailureResult(claim, error, "internal-failure", snapshot);
  }
}

export function isMenuSourceSyncFailure(result: MenuSourceSyncResult): boolean {
  return [
    "blocked",
    "provider-failure",
    "source-unavailable",
    "internal-failure",
    "superseded",
  ].includes(result.status);
}

/** Sync one source by stable DB identity; callers never supply provider data. */
export async function syncCanteenMenuSource(
  sourceId: string,
): Promise<MenuSourceSyncResult> {
  const result = await acquireMenuSourceClaim(sourceId);
  if (result.status === "unavailable") {
    return {
      sourceId,
      status: "source-unavailable",
      code: result.code,
    };
  }
  if (result.status === "already-running") {
    return {
      sourceId,
      canteenId: result.canteenId,
      runId: result.runId,
      status: "already-running",
      code: "MENU_SYNC_ALREADY_RUNNING",
    };
  }
  return executeClaimedMenuSourceSync(result.claim);
}

/** Claims and executes at most one source due in the database-time window. */
export async function syncNextDueMenuSource(): Promise<NextDueMenuSourceSyncResult> {
  const acquired = await acquireNextDueMenuSourceClaim();
  if (acquired.status === "no-work") {
    return { disposition: "no-work", window: acquired.window };
  }
  if (acquired.status !== "claimed") {
    return {
      disposition: acquired.status,
      window: acquired.window,
      sourceId: acquired.sourceId,
      code: normalizeSyncErrorCode(acquired.code) as NormalizedSyncCode,
    };
  }

  const result = await executeClaimedMenuSourceSync(acquired.claim);
  if (result.status === "applied" || result.status === "unchanged") {
    return {
      disposition: "continue",
      window: acquired.window,
      sourceId: acquired.claim.source.id,
      result,
    };
  }
  if (
    result.status === "blocked" ||
    isReviewRequiredMenuSyncCode(result.code)
  ) {
    return {
      disposition: "stop-for-review",
      window: acquired.window,
      sourceId: acquired.claim.source.id,
      code: result.code as NormalizedSyncCode,
      result,
    };
  }
  if (
    acquired.attemptNumber >= 3 &&
    (result.status === "provider-failure" ||
      result.status === "internal-failure")
  ) {
    return {
      disposition: "stop-for-review",
      window: acquired.window,
      sourceId: acquired.claim.source.id,
      code: "MENU_SYNC_RETRY_LIMIT" as NormalizedSyncCode,
      result,
    };
  }
  if (result.status === "source-unavailable") {
    return {
      disposition: "continue",
      window: acquired.window,
      sourceId: acquired.claim.source.id,
      result,
    };
  }
  return {
    disposition: "retry-later",
    window: acquired.window,
    sourceId: acquired.claim.source.id,
    code: result.code as NormalizedSyncCode,
    result,
  };
}

export async function syncEnabledCanteenMenuSources(): Promise<
  MenuSourceSyncResult[]
> {
  const sources = await db.query.canteenMenuSources.findMany({
    where: eq(canteenMenuSources.enabled, true),
    columns: { id: true },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  const results: MenuSourceSyncResult[] = [];
  for (let index = 0; index < sources.length; index += MAX_CONCURRENCY) {
    results.push(
      ...(await Promise.all(
        sources
          .slice(index, index + MAX_CONCURRENCY)
          .map(async (source) => syncCanteenMenuSource(source.id)),
      )),
    );
  }
  return results;
}
