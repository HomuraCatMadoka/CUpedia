import { canteenMenuSources, canteenMenuSyncRuns } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { MenuSyncTransaction } from "./canteen-menu-sync-store";
import {
  menuSyncWindowAcceptsActivity,
  type MenuSyncWindow,
} from "./canteen-menu-sync-window";

const MAX_WINDOW_FAILURES = 3;
const FIRST_RETRY_DELAY_MS = 2 * 60 * 1_000;
const LATER_RETRY_DELAY_MS = 5 * 60 * 1_000;
const REVIEW_REQUIRED_CODES = new Set([
  "MENU_SYNC_CONFLICT",
  "MENU_SYNC_IDENTITY_CHURN",
  "MENU_SYNC_SUSPICIOUS_DROP",
]);

type MenuSourceScheduleFacts = {
  sourceId: string;
  createdAt: Date;
  activeClaim: boolean;
  failureCount: number;
  latestErrorCode: string | null;
  latestFailedAt: Date | null;
};

export type MenuSourceScheduleCandidate =
  | { state: "claimable"; sourceId: string; attemptNumber: number }
  | {
      state: "retry-later" | "stop-for-review";
      sourceId: string;
      code: string;
    };

function parseDatabaseDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("INVALID_DATABASE_TIME");
  return parsed;
}

export function isReviewRequiredMenuSyncCode(code: string): boolean {
  return code.startsWith("INVALID_") || REVIEW_REQUIRED_CODES.has(code);
}

function classifyMenuSourceSchedule(
  facts: MenuSourceScheduleFacts,
  databaseNow: Date,
): MenuSourceScheduleCandidate {
  if (facts.activeClaim) {
    return {
      state: "retry-later",
      sourceId: facts.sourceId,
      code: "MENU_SYNC_ALREADY_RUNNING",
    };
  }
  if (facts.failureCount >= MAX_WINDOW_FAILURES) {
    return {
      state: "stop-for-review",
      sourceId: facts.sourceId,
      code: "MENU_SYNC_RETRY_LIMIT",
    };
  }
  if (
    facts.latestErrorCode !== null &&
    isReviewRequiredMenuSyncCode(facts.latestErrorCode)
  ) {
    return {
      state: "stop-for-review",
      sourceId: facts.sourceId,
      code: facts.latestErrorCode,
    };
  }
  if (facts.latestFailedAt) {
    const delay =
      facts.failureCount === 1 ? FIRST_RETRY_DELAY_MS : LATER_RETRY_DELAY_MS;
    if (facts.latestFailedAt.getTime() + delay > databaseNow.getTime()) {
      return {
        state: "retry-later",
        sourceId: facts.sourceId,
        code: facts.latestErrorCode ?? "UNKNOWN_SYNC_ERROR",
      };
    }
  }
  return {
    state: "claimable",
    sourceId: facts.sourceId,
    attemptNumber: facts.failureCount + 1,
  };
}

function candidateRank(candidate: MenuSourceScheduleCandidate): number {
  switch (candidate.state) {
    case "claimable":
      return 0;
    case "retry-later":
      return 1;
    case "stop-for-review":
      return 2;
  }
}

async function readMenuSourceScheduleFacts(
  tx: MenuSyncTransaction,
  window: MenuSyncWindow,
  sourceId?: string,
): Promise<MenuSourceScheduleFacts[]> {
  const sourceFilter = sourceId ? sql`source.id = ${sourceId}` : sql`true`;
  const result = await tx.execute<{
    source_id: string;
    created_at: string | Date;
    active_claim: boolean;
    failure_count: number;
    latest_error_code: string | null;
    latest_failed_at: string | Date | null;
  }>(sql`
    select
      source.id as source_id,
      source.created_at,
      coalesce(source.sync_claim_expires_at > now(), false) as active_claim,
      count(run.id) filter (
        where run.status = 'failed'
          and coalesce(run.error_code, '') <> 'MENU_SYNC_SUPERSEDED'
      )::integer as failure_count,
      (array_agg(run.error_code order by run.started_at desc, run.id desc)
        filter (
          where run.status = 'failed'
            and coalesce(run.error_code, '') <> 'MENU_SYNC_SUPERSEDED'
        ))[1] as latest_error_code,
      max(coalesce(run.completed_at, run.started_at)) filter (
        where run.status = 'failed'
          and coalesce(run.error_code, '') <> 'MENU_SYNC_SUPERSEDED'
      ) as latest_failed_at
    from ${canteenMenuSources} as source
    left join ${canteenMenuSyncRuns} as run
      on run.menu_source_id = source.id
      and run.started_at >= ${window.claimsStartAt}
      and run.started_at < ${window.endsAt}
    where source.enabled = true
      and not (${window.hktWeekday} = any(source.closed_weekdays))
      and ${window.period} = any(source.sync_meal_periods)
      and ${sourceFilter}
    group by source.id
    having count(run.id) filter (
      where run.status in ('applied', 'unchanged')
    ) = 0
  `);
  return result.rows.map((row) => ({
    sourceId: row.source_id,
    createdAt: parseDatabaseDate(row.created_at)!,
    activeClaim: row.active_claim,
    failureCount: Number(row.failure_count),
    latestErrorCode: row.latest_error_code,
    latestFailedAt: parseDatabaseDate(row.latest_failed_at),
  }));
}

export async function listMenuSourceScheduleCandidates(
  tx: MenuSyncTransaction,
  window: MenuSyncWindow,
  databaseNow: Date,
): Promise<MenuSourceScheduleCandidate[]> {
  if (!menuSyncWindowAcceptsActivity(window, databaseNow)) return [];
  const facts = await readMenuSourceScheduleFacts(tx, window);
  return facts
    .map((item) => ({
      candidate: classifyMenuSourceSchedule(item, databaseNow),
      createdAt: item.createdAt,
      failureCount: item.failureCount,
    }))
    .sort(
      (left, right) =>
        candidateRank(left.candidate) - candidateRank(right.candidate) ||
        left.failureCount - right.failureCount ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.candidate.sourceId.localeCompare(right.candidate.sourceId),
    )
    .map(({ candidate }) => candidate);
}

export async function recheckMenuSourceScheduleCandidate(
  tx: MenuSyncTransaction,
  window: MenuSyncWindow,
  sourceId: string,
  databaseNow: Date,
): Promise<MenuSourceScheduleCandidate | null> {
  if (!menuSyncWindowAcceptsActivity(window, databaseNow)) return null;
  const facts = await readMenuSourceScheduleFacts(tx, window, sourceId);
  return facts[0] ? classifyMenuSourceSchedule(facts[0], databaseNow) : null;
}
