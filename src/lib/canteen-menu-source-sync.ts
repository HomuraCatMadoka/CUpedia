import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  CANTEEN_MENU_SYNC_TERMINAL_STATUSES,
  canteenMenuSources,
  canteenMenuSyncRuns,
} from "@/db/schema";
import { and, eq, getTableColumns, inArray, lt, sql } from "drizzle-orm";
import { fetchMenuFromProvider } from "./canteen-menu-source-adapters";
import {
  commitClaimedRecurringMenuSync,
  previewMenuSync,
} from "./canteen-menu-sync-store";
import { normalizeSyncErrorCode } from "./sync-error-code";

const MAX_ERROR_LENGTH = 1_000;
const MAX_CONCURRENCY = 2;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const CLAIM_DURATION_MS = 2 * 60 * 1_000;

type MenuSourceSyncResultBase = {
  sourceId: string;
  canteenId?: string;
  runId?: string;
  code: string;
};

export type MenuSourceSyncResult = MenuSourceSyncResultBase &
  (
    | { status: "applied" | "unchanged"; itemCount: number }
    | { status: "already-running" }
    | {
        status: "blocked";
        code:
          | "MENU_SYNC_CONFLICT"
          | "MENU_SYNC_IDENTITY_CHURN"
          | "MENU_SYNC_SUSPICIOUS_DROP";
      }
    | { status: "provider-failure" }
    | { status: "superseded"; code: "MENU_SYNC_SUPERSEDED" }
  );

type ClaimedSource = typeof canteenMenuSources.$inferSelect;

async function acquireSourceClaim(
  sourceId: string,
): Promise<
  | { status: "claimed"; source: ClaimedSource; runId: string }
  | { status: "already-running"; runId: string; canteenId: string }
  | { status: "unavailable" }
> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        ...getTableColumns(canteenMenuSources),
        databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId))
      .for("update", { of: canteenMenuSources });
    const source = locked;
    if (!source || !source.enabled) return { status: "unavailable" };
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
    const claimExpiresAt = new Date(now.getTime() + CLAIM_DURATION_MS);
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
        syncClaimExpiresAt: claimExpiresAt,
        updatedAt: now,
      })
      .where(eq(canteenMenuSources.id, source.id))
      .returning();
    await tx.insert(canteenMenuSyncRuns).values({
      id: runId,
      menuSourceId: source.id,
      startedAt: now,
    });
    return { status: "claimed", source: claimedSource, runId };
  });
}

function snapshotHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN_SYNC_ERROR";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function errorCode(error: unknown): string {
  return normalizeSyncErrorCode(error instanceof Error ? error.message : null);
}

async function finishClaimedProviderFailure(
  source: ClaimedSource,
  runId: string,
  details: {
    code: string;
    message: string;
    snapshotHash?: string;
    itemCount?: number;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        claimToken: canteenMenuSources.syncClaimToken,
        claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
        databaseNow: sql<Date>`now()`.mapWith(canteenMenuSources.updatedAt),
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, source.id))
      .for("update", { of: canteenMenuSources });
    if (!locked || locked.claimToken !== runId || locked.claimExpired) {
      return false;
    }
    const [updatedSource] = await tx
      .update(canteenMenuSources)
      .set({
        observedState: "error",
        lastErrorCode: details.code,
        lastError: details.message,
        syncClaimToken: null,
        syncClaimExpiresAt: null,
        updatedAt: locked.databaseNow,
      })
      .where(
        and(
          eq(canteenMenuSources.id, source.id),
          eq(canteenMenuSources.syncClaimToken, runId),
        ),
      )
      .returning({ id: canteenMenuSources.id });
    const [updatedRun] = await tx
      .update(canteenMenuSyncRuns)
      .set({
        status: "failed",
        snapshotHash: details.snapshotHash,
        itemCount: details.itemCount,
        observation: {},
        errorCode: details.code,
        error: details.message,
        completedAt: locked.databaseNow,
      })
      .where(
        and(
          eq(canteenMenuSyncRuns.id, runId),
          eq(canteenMenuSyncRuns.status, "running"),
        ),
      )
      .returning({ id: canteenMenuSyncRuns.id });
    if (!updatedSource || !updatedRun) {
      throw new Error("MENU_SYNC_FINALIZATION_INCONSISTENT");
    }
    return true;
  });
}

/** Sync one source by stable DB identity; callers never supply a canteen ID. */
export async function syncCanteenMenuSource(
  sourceId: string,
): Promise<MenuSourceSyncResult> {
  const claim = await acquireSourceClaim(sourceId);
  if (claim.status === "unavailable") {
    return {
      sourceId,
      status: "provider-failure",
      code: "MENU_SOURCE_NOT_FOUND",
    };
  }
  if (claim.status === "already-running") {
    return {
      sourceId,
      canteenId: claim.canteenId,
      runId: claim.runId,
      status: "already-running",
      code: "MENU_SYNC_ALREADY_RUNNING",
    };
  }
  const { source, runId: attemptId } = claim;

  let attemptSnapshotHash: string | undefined;
  let attemptItemCount: number | undefined;
  try {
    const fetched = await fetchMenuFromProvider(source);
    const input = { ...fetched, takeOverLegacyItems: false };
    if (input.items.length === 0) throw new Error("EMPTY_MENU_SYNC");
    const hash = snapshotHash(input);
    attemptSnapshotHash = hash;
    attemptItemCount = input.items.length;
    const { previewToken } = await previewMenuSync(source.id, input);
    const committed = await commitClaimedRecurringMenuSync(
      input,
      previewToken,
      { runId: attemptId, snapshotHash: hash, itemCount: input.items.length },
    );
    if (committed.status === "blocked") {
      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        runId: attemptId,
        status: "blocked",
        code: committed.evaluation.blockingDecision.code!,
      };
    }
    return {
      sourceId: source.id,
      canteenId: source.canteenId,
      runId: attemptId,
      status: committed.status,
      code:
        committed.status === "applied"
          ? "MENU_SYNC_APPLIED"
          : "MENU_SYNC_UNCHANGED",
      itemCount: input.items.length,
    };
  } catch (error) {
    const message = safeError(error);
    const code = errorCode(error);
    if (code === "MENU_SYNC_SUPERSEDED") {
      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        runId: attemptId,
        status: "superseded",
        code,
      };
    }
    const finalized = await finishClaimedProviderFailure(source, attemptId, {
      code,
      message,
      snapshotHash: attemptSnapshotHash,
      itemCount: attemptItemCount,
    });
    if (!finalized) {
      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        runId: attemptId,
        status: "superseded",
        code: "MENU_SYNC_SUPERSEDED",
      };
    }
    return {
      sourceId: source.id,
      canteenId: source.canteenId,
      runId: attemptId,
      status: "provider-failure",
      code,
    };
  }
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
