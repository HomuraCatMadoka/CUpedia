import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import { canteenMenuSources, canteenMenuSyncRuns } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { fetchMenuFromProvider } from "@/lib/canteen-menu-source-adapters";
import {
  applyAutomatedMenuSync,
  previewMenuSync,
} from "@/lib/canteen-menu-sync-store";
import type { MenuIdentityObservation } from "@/lib/canteen-menu-sync-observation";

const MAX_ERROR_LENGTH = 1_000;
const MAX_CONCURRENCY = 2;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type MenuSourceSyncResult = {
  sourceId: string;
  canteenId: string;
  status: "applied" | "failed" | "unchanged";
  itemCount?: number;
  error?: string;
};

function snapshotHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN_SYNC_ERROR";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN_SYNC_ERROR";
  const code = message.match(/^[A-Z][A-Z0-9_]*(?:_\d{3})?/)?.[0];
  return code ?? "UNKNOWN_SYNC_ERROR";
}

/** Sync one source by stable DB identity; callers never supply a canteen ID. */
export async function syncCanteenMenuSource(
  sourceId: string,
): Promise<MenuSourceSyncResult> {
  const attemptId = randomUUID();
  const attemptedAt = new Date();
  const [source] = await db
    .update(canteenMenuSources)
    .set({
      lastAttemptId: attemptId,
      lastAttemptAt: attemptedAt,
      updatedAt: attemptedAt,
    })
    .where(
      and(
        eq(canteenMenuSources.id, sourceId),
        eq(canteenMenuSources.enabled, true),
      ),
    )
    .returning();
  if (!source) {
    return {
      sourceId,
      canteenId: "",
      status: "failed",
      error: "MENU_SOURCE_NOT_FOUND",
    };
  }
  await db
    .delete(canteenMenuSyncRuns)
    .where(
      and(
        eq(canteenMenuSyncRuns.menuSourceId, source.id),
        lt(
          canteenMenuSyncRuns.startedAt,
          new Date(attemptedAt.getTime() - RUN_RETENTION_MS),
        ),
      ),
    );
  await db.insert(canteenMenuSyncRuns).values({
    id: attemptId,
    menuSourceId: source.id,
    startedAt: attemptedAt,
  });

  try {
    const fetched = await fetchMenuFromProvider(source);
    const input = { ...fetched, takeOverLegacyItems: false };
    if (input.items.length === 0) throw new Error("EMPTY_MENU_SYNC");
    const hash = snapshotHash(input);
    const preview = await previewMenuSync(source.id, input);
    const observation = preview.identityObservation;
    if (preview.blockingDecision.blocked) {
      throw Object.assign(new Error(preview.blockingDecision.code), {
        observation,
        snapshotHash: hash,
        itemCount: input.items.length,
      });
    }
    const updateSuccess = async (completedAt: Date) => {
      const [updated] = await db
        .update(canteenMenuSources)
        .set({
          lastSuccessAt: completedAt,
          lastSnapshotHash: hash,
          observedState: "available",
          lastErrorCode: null,
          lastError: null,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(canteenMenuSources.id, source.id),
            eq(canteenMenuSources.lastAttemptId, attemptId),
          ),
        )
        .returning({ id: canteenMenuSources.id });
      if (!updated) throw new Error("MENU_SYNC_SUPERSEDED");
    };

    if (preview.plan.actions.length === 0) {
      await updateSuccess(new Date());
      await db
        .update(canteenMenuSyncRuns)
        .set({
          status: "unchanged",
          snapshotHash: hash,
          itemCount: input.items.length,
          createdCount: 0,
          updatedCount: 0,
          deactivatedCount: 0,
          observation,
          completedAt: new Date(),
        })
        .where(eq(canteenMenuSyncRuns.id, attemptId));
      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        status: "unchanged",
        itemCount: input.items.length,
      };
    }

    const deactivations = preview.plan.actions.filter(
      (action) => action.action === "deactivate",
    ).length;
    await applyAutomatedMenuSync(
      source.id,
      input,
      preview.previewToken,
      attemptId,
    );
    await updateSuccess(new Date());
    await db
      .update(canteenMenuSyncRuns)
      .set({
        status: "applied",
        snapshotHash: hash,
        itemCount: input.items.length,
        createdCount: preview.plan.actions.filter(
          (action) => action.action === "create",
        ).length,
        updatedCount: preview.plan.actions.filter((action) =>
          ["update", "reactivate", "claim"].includes(action.action),
        ).length,
        deactivatedCount: deactivations,
        observation,
        completedAt: new Date(),
      })
      .where(eq(canteenMenuSyncRuns.id, attemptId));
    return {
      sourceId: source.id,
      canteenId: source.canteenId,
      status: "applied",
      itemCount: input.items.length,
    };
  } catch (error) {
    const message = safeError(error);
    const code = errorCode(error);
    await db
      .update(canteenMenuSources)
      .set({
        observedState: "error",
        lastErrorCode: code,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(canteenMenuSources.id, source.id),
          eq(canteenMenuSources.lastAttemptId, attemptId),
        ),
      );
    const details = error as {
      observation?: MenuIdentityObservation;
      snapshotHash?: string;
      itemCount?: number;
    };
    await db
      .update(canteenMenuSyncRuns)
      .set({
        status: "failed",
        snapshotHash: details.snapshotHash,
        itemCount: details.itemCount,
        observation: details.observation ?? {},
        errorCode: code,
        error: message,
        completedAt: new Date(),
      })
      .where(eq(canteenMenuSyncRuns.id, attemptId));
    return {
      sourceId: source.id,
      canteenId: source.canteenId,
      status: "failed",
      error: code,
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
          .map((source) => syncCanteenMenuSource(source.id)),
      )),
    );
  }
  return results;
}
