import { createHash } from "node:crypto";
import { db } from "@/db";
import { canteenMenuSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchMenuFromProvider } from "@/lib/canteen-menu-source-adapters";
import {
  applyAutomatedMenuSync,
  previewMenuSync,
} from "@/lib/canteen-menu-sync-store";

const MAX_ERROR_LENGTH = 1_000;
const MAX_CONCURRENCY = 2;

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

async function syncSource(
  source: typeof canteenMenuSources.$inferSelect,
): Promise<MenuSourceSyncResult> {
  const attemptedAt = new Date();
  await db
    .update(canteenMenuSources)
    .set({ lastAttemptAt: attemptedAt, updatedAt: attemptedAt })
    .where(eq(canteenMenuSources.id, source.id));

  try {
    const input = await fetchMenuFromProvider(source);
    if (input.items.length === 0) throw new Error("EMPTY_MENU_SYNC");
    const hash = snapshotHash(input);
    if (hash === source.lastSnapshotHash) {
      await db
        .update(canteenMenuSources)
        .set({
          lastSuccessAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(canteenMenuSources.id, source.id));
      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        status: "unchanged",
        itemCount: input.items.length,
      };
    }

    const preview = await previewMenuSync(source.canteenId, input);
    const deactivations = preview.plan.actions.filter(
      (action) => action.action === "deactivate",
    ).length;
    if (deactivations >= 10 && input.items.length < deactivations / 2) {
      throw new Error("MENU_SYNC_SUSPICIOUS_DROP");
    }
    await applyAutomatedMenuSync(source.canteenId, input, preview.previewToken);
    const completedAt = new Date();
    await db
      .update(canteenMenuSources)
      .set({
        lastSuccessAt: completedAt,
        lastSnapshotHash: hash,
        lastError: null,
        updatedAt: completedAt,
      })
      .where(eq(canteenMenuSources.id, source.id));
    return {
      sourceId: source.id,
      canteenId: source.canteenId,
      status: "applied",
      itemCount: input.items.length,
    };
  } catch (error) {
    const message = safeError(error);
    await db
      .update(canteenMenuSources)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(canteenMenuSources.id, source.id));
    return {
      sourceId: source.id,
      canteenId: source.canteenId,
      status: "failed",
      error: message,
    };
  }
}

export async function syncEnabledCanteenMenuSources(): Promise<
  MenuSourceSyncResult[]
> {
  const sources = await db.query.canteenMenuSources.findMany({
    where: eq(canteenMenuSources.enabled, true),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  const results: MenuSourceSyncResult[] = [];
  for (let index = 0; index < sources.length; index += MAX_CONCURRENCY) {
    results.push(
      ...(await Promise.all(
        sources.slice(index, index + MAX_CONCURRENCY).map(syncSource),
      )),
    );
  }
  return results;
}
