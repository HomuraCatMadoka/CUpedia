import { db } from "@/db";
import { canteenMenuSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { acquireMenuSourceClaim } from "./canteen-menu-source-claim-store";
import { executeClaimedMenuSourceSync } from "./canteen-menu-sync-store";

const MAX_CONCURRENCY = 2;

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
