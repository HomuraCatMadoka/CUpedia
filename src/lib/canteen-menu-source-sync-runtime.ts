import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
  canteenMenuSources,
  canteenMenuSyncRuns,
} from "@/db/schema";
import { and, eq, getTableColumns, inArray, lt, sql } from "drizzle-orm";
import type { MenuSyncInput } from "@/lib/canteen-types";
import { fetchMenuFromProvider } from "./canteen-menu-source-adapters";
import type { MenuIdentityObservation } from "./canteen-menu-sync-observation";
import {
  commitClaimedRecurringMenuSync,
  previewMenuSync,
} from "./canteen-menu-sync-store";
import type {
  MenuSourceSyncResult,
  NormalizedSyncCode,
} from "./canteen-menu-source-sync";
import { normalizeSyncErrorCode } from "./sync-error-code";

const CLAIM_DURATION_MS = 2 * 60 * 1_000;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_ERROR_LENGTH = 1_000;

type MenuSourceRow = typeof canteenMenuSources.$inferSelect;
const issuedClaims = new WeakSet<object>();
declare const menuSourceClaimBrand: unique symbol;

export type MenuSourceClaimTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type MenuSourceClaim = {
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

export type LockedMenuSourceClaim = MenuSourceRow & {
  databaseNow: Date;
  claimExpired: boolean;
};

export type ClaimedRunFinalization =
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
    }
  | { kind: "superseded" };

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
  source: LockedMenuSourceClaim,
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
  tx: MenuSourceClaimTransaction,
  sourceId: string,
): Promise<LockedMenuSourceClaim | undefined> {
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

async function acquireMenuSourceClaim(
  sourceId: string,
): Promise<MenuSourceClaimResult> {
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
    await tx
      .delete(canteenMenuSyncRuns)
      .where(
        and(
          eq(canteenMenuSyncRuns.menuSourceId, source.id),
          inArray(
            canteenMenuSyncRuns.status,
            CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
          ),
          lt(
            canteenMenuSyncRuns.startedAt,
            new Date(now.getTime() - RUN_RETENTION_MS),
          ),
        ),
      );
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

export async function lockMenuSourceClaim(
  tx: MenuSourceClaimTransaction,
  claim: MenuSourceClaim,
): Promise<LockedMenuSourceClaim | undefined> {
  const source = await selectLockedSource(tx, claim.source.id);
  return source && isCurrentClaim(source, claim) ? source : undefined;
}

export async function finalizeLockedClaimedRun(
  tx: MenuSourceClaimTransaction,
  source: LockedMenuSourceClaim,
  claim: MenuSourceClaim,
  outcome: ClaimedRunFinalization,
  fence: "strict" | "token-only" = "strict",
): Promise<void> {
  if (
    !issuedClaims.has(claim) ||
    source.syncClaimToken !== claim.runId ||
    (fence === "strict" && !isCurrentClaim(source, claim))
  ) {
    throw new Error("MENU_SYNC_SUPERSEDED");
  }
  const now = source.databaseNow;
  const sourceValues =
    outcome.kind === "success"
      ? {
          lastSuccessAt: now,
          lastSnapshotHash: outcome.snapshotHash,
          observedState: "available",
          lastErrorCode: null,
          lastError: null,
          syncClaimToken: null,
          syncClaimExpiresAt: null,
          updatedAt: now,
        }
      : outcome.kind === "error"
        ? {
            observedState: "error",
            lastErrorCode: outcome.code,
            lastError: outcome.message,
            syncClaimToken: null,
            syncClaimExpiresAt: null,
            updatedAt: now,
          }
        : {
            syncClaimToken: null,
            syncClaimExpiresAt: null,
            updatedAt: now,
          };
  const runValues =
    outcome.kind === "success"
      ? {
          status: outcome.status,
          snapshotHash: outcome.snapshotHash,
          itemCount: outcome.itemCount,
          createdCount: outcome.createdCount,
          updatedCount: outcome.updatedCount,
          deactivatedCount: outcome.deactivatedCount,
          observation: outcome.observation,
          completedAt: now,
        }
      : outcome.kind === "error"
        ? {
            status: "failed" as const,
            snapshotHash: outcome.snapshotHash,
            itemCount: outcome.itemCount,
            observation: outcome.observation,
            errorCode: outcome.code,
            error: outcome.message,
            completedAt: now,
          }
        : {
            status: "failed" as const,
            errorCode: "MENU_SYNC_SUPERSEDED",
            error: "MENU_SYNC_SUPERSEDED",
            completedAt: now,
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

export async function finalizeClaimedRun(
  claim: MenuSourceClaim,
  outcome: ClaimedRunFinalization,
  fence: "strict" | "token-only" = "strict",
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const source = await selectLockedSource(tx, claim.source.id);
    if (
      !source ||
      !issuedClaims.has(claim) ||
      source.syncClaimToken !== claim.runId ||
      (fence === "strict" && !isCurrentClaim(source, claim))
    ) {
      return false;
    }
    await finalizeLockedClaimedRun(tx, source, claim, outcome, fence);
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

async function finishClaimedSuperseded(claim: MenuSourceClaim): Promise<void> {
  await finalizeClaimedRun(claim, { kind: "superseded" }, "token-only");
}

async function finalizeFailureResult(
  claim: MenuSourceClaim,
  error: unknown,
  status: "provider-failure" | "internal-failure",
  snapshot?: { hash: string; itemCount: number },
): Promise<MenuSourceSyncResult> {
  const code = errorCode(error);
  if (code === "MENU_SYNC_SUPERSEDED") {
    await finishClaimedSuperseded(claim);
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
    await finishClaimedSuperseded(claim);
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
    const { previewToken } = await previewMenuSync(source.id, input);
    const committed = await commitClaimedRecurringMenuSync(
      input,
      previewToken,
      {
        claim,
        snapshotHash: snapshot.hash,
        itemCount: snapshot.itemCount,
      },
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

/** The only exported recurring operation; internal claim capabilities never escape. */
export async function runMenuSourceSync(
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
