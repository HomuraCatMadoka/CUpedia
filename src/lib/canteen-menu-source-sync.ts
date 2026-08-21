import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
  canteenMenuSources,
  canteenMenuSyncRuns,
} from "@/db/schema";
import { and, eq, getTableColumns, inArray, lt, sql } from "drizzle-orm";
import { lockCanteenMenuMutationForSource } from "./canteen-menu-mutation-lock";
import { fetchMenuFromProvider } from "./canteen-menu-source-adapters";
import type { MenuIdentityObservation } from "./canteen-menu-sync-observation";
import {
  applyRecurringMenuProjection,
  type LockedMenuSource,
  type MenuSyncTransaction,
} from "./canteen-menu-sync-store";
import type { MenuSyncInput } from "./canteen-types";
import { normalizeSyncErrorCode } from "./sync-error-code";

const MAX_CONCURRENCY = 2;
const CLAIM_DURATION_MS = 2 * 60 * 1_000;
const MAX_ERROR_LENGTH = 1_000;

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
): Promise<LockedMenuSource | undefined> {
  const [source] = await tx
    .select({
      ...getTableColumns(canteenMenuSources),
      databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
    })
    .from(canteenMenuSources)
    .where(eq(canteenMenuSources.id, sourceId))
    .for("update", { of: canteenMenuSources });
  return source;
}

async function pruneTerminalMenuSyncRuns(sourceId: string): Promise<void> {
  await db
    .delete(canteenMenuSyncRuns)
    .where(
      and(
        eq(canteenMenuSyncRuns.menuSourceId, sourceId),
        inArray(
          canteenMenuSyncRuns.status,
          CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
        ),
        lt(canteenMenuSyncRuns.startedAt, sql`now() - interval '30 days'`),
      ),
    );
}

async function acquireMenuSourceClaim(
  sourceId: string,
): Promise<MenuSourceClaimResult> {
  await pruneTerminalMenuSyncRuns(sourceId);

  return db.transaction(async (tx) => {
    const source = await selectLockedSource(tx, sourceId);
    if (!source) {
      return { status: "unavailable", code: "MENU_SOURCE_NOT_FOUND" };
    }
    if (!source.enabled) {
      return { status: "unavailable", code: "MENU_SOURCE_DISABLED" };
    }
    const now = source.databaseNow;
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
  });
}

async function finalizeLockedClaimedRun(
  tx: MenuSyncTransaction,
  source: LockedMenuSource,
  claim: MenuSourceClaim,
  outcome: ClaimedRunFinalization,
): Promise<void> {
  if (!isCurrentClaim(source, claim)) {
    throw new Error("MENU_SYNC_SUPERSEDED");
  }
  const now = source.databaseNow;
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
    await finalizeLockedClaimedRun(tx, source, claim, outcome);
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
    if (projection.status === "blocked") {
      const code = projection.evaluation.blockingDecision.code;
      if (!code) throw new Error("MENU_SYNC_BLOCKED_WITHOUT_CODE");
      await finalizeLockedClaimedRun(tx, source, claim, {
        kind: "error",
        code,
        message: code,
        snapshotHash: snapshot.hash,
        itemCount: snapshot.itemCount,
        observation: projection.evaluation.identityObservation,
      });
      return projection;
    }
    await finalizeLockedClaimedRun(tx, source, claim, {
      kind: "success",
      status: projection.status,
      snapshotHash: snapshot.hash,
      itemCount: snapshot.itemCount,
      createdCount: projection.createdCount,
      updatedCount: projection.updatedCount,
      deactivatedCount: projection.deactivatedCount,
      observation: projection.evaluation.identityObservation,
    });
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
    if (input.items.length === 0) throw new Error("EMPTY_MENU_SYNC");
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
