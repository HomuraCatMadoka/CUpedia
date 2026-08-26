import {
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteenMenuSyncSnapshots,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import type { MenuSyncTransaction } from "./canteen-menu-sync-store";
import {
  menuSyncWindowAcceptsActivity,
  type MenuSyncWindow,
} from "./canteen-menu-sync-window";

const MAX_WINDOW_FAILURES = 3;
const FIRST_RETRY_DELAY_MS = 2 * 60 * 1_000;
const LATER_RETRY_DELAY_MS = 5 * 60 * 1_000;
const MIN_SCOPED_OBSERVATION_INTERVAL_MS = 10 * 60 * 1_000;
const SCOPED_OBSERVATION_REFRESH_MS = 45 * 60 * 1_000;
const MAX_REFRESH_BOUNDARIES = 128;
const REVIEW_REQUIRED_CODES = new Set([
  "MENU_SYNC_CONFLICT",
  "MENU_SYNC_IDENTITY_CHURN",
  "MENU_SYNC_SUSPICIOUS_DROP",
]);

export type LatestMenuSourceObservation = {
  observedAt: Date;
  observedMinuteOfDay: number;
  observationScope: "catalog" | "meal-period" | null;
  scopeEvidence: Record<string, unknown>;
};

function refreshBoundaryMinutes(evidence: Record<string, unknown>): number[] {
  if (!Array.isArray(evidence.refreshBoundaryMinutes)) return [];
  return evidence.refreshBoundaryMinutes
    .slice(0, MAX_REFRESH_BOUNDARIES)
    .filter(
      (value): value is number =>
        Number.isInteger(value) && value >= 0 && value <= 1439,
    )
    .sort((left, right) => left - right);
}

function refreshUntilMinute(evidence: Record<string, unknown>): number | null {
  const value = evidence.refreshUntilMinute;
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 1439
    ? Number(value)
    : null;
}

function observationClock(latest: LatestMenuSourceObservation): {
  minuteOfDay: number;
  millisecondsIntoMinute: number;
} | null {
  if (
    !Number.isInteger(latest.observedMinuteOfDay) ||
    latest.observedMinuteOfDay < 0 ||
    latest.observedMinuteOfDay > 1439
  ) {
    return null;
  }
  return {
    minuteOfDay: latest.observedMinuteOfDay,
    millisecondsIntoMinute:
      latest.observedAt.getUTCSeconds() * 1_000 +
      latest.observedAt.getUTCMilliseconds(),
  };
}

/**
 * Returns the next useful refresh time for a successful observation at the
 * database check time. Provider boundaries can advance the bounded fallback.
 */
export function nextMenuSourceObservationAt(
  window: MenuSyncWindow,
  latest: LatestMenuSourceObservation,
  databaseNow: Date,
): Date | null {
  if (latest.observationScope !== "meal-period") return null;

  const clock = observationClock(latest);
  if (clock) {
    const horizonMinute = refreshUntilMinute(latest.scopeEvidence);
    if (horizonMinute !== null) {
      if (horizonMinute <= clock.minuteOfDay) return null;
      const horizonAt = new Date(
        latest.observedAt.getTime() +
          (horizonMinute - clock.minuteOfDay) * 60 * 1_000 -
          clock.millisecondsIntoMinute,
      );
      if (databaseNow >= horizonAt) return null;
    }
  }

  const earliestRepeatAt = new Date(
    latest.observedAt.getTime() + MIN_SCOPED_OBSERVATION_INTERVAL_MS,
  );
  const candidates = [
    new Date(latest.observedAt.getTime() + SCOPED_OBSERVATION_REFRESH_MS),
  ];
  if (clock) {
    const nextBoundary = refreshBoundaryMinutes(latest.scopeEvidence).find(
      (minute) => minute > clock.minuteOfDay,
    );
    if (nextBoundary !== undefined) {
      const boundaryAt = new Date(
        latest.observedAt.getTime() +
          (nextBoundary - clock.minuteOfDay) * 60 * 1_000 -
          clock.millisecondsIntoMinute,
      );
      candidates.push(
        boundaryAt < earliestRepeatAt ? earliestRepeatAt : boundaryAt,
      );
    }
  }

  return (
    candidates
      .filter(
        (candidate) =>
          candidate >= window.claimsStartAt && candidate < window.endsAt,
      )
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
  );
}

type MenuSourceScheduleFacts = {
  sourceId: string;
  createdAt: Date;
  activeClaim: boolean;
  failureCount: number;
  latestErrorCode: string | null;
  latestFailedAt: Date | null;
};

type MenuSourceFailedRun = {
  startedAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
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

function parseFailedRuns(value: unknown): MenuSourceFailedRun[] {
  let input = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error("INVALID_MENU_SYNC_FAILURE_HISTORY");
    }
  }
  if (!Array.isArray(input))
    throw new Error("INVALID_MENU_SYNC_FAILURE_HISTORY");
  return input.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("INVALID_MENU_SYNC_FAILURE_HISTORY");
    }
    const row = entry as Record<string, unknown>;
    const startedAt = parseDatabaseDate(row.startedAt);
    if (!startedAt) throw new Error("INVALID_MENU_SYNC_FAILURE_HISTORY");
    return {
      startedAt,
      completedAt: parseDatabaseDate(row.completedAt),
      errorCode: typeof row.errorCode === "string" ? row.errorCode : null,
    };
  });
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
  databaseNow: Date,
  sourceId?: string,
): Promise<MenuSourceScheduleFacts[]> {
  const sourceFilter = sourceId ? sql`source.id = ${sourceId}` : sql`true`;
  const result = await tx.execute<{
    source_id: string;
    created_at: string | Date;
    active_claim: boolean;
    latest_success_at: string | Date | null;
    latest_observed_minute_of_day: number | null;
    latest_observation_scope: "catalog" | "meal-period" | null;
    latest_scope_evidence: Record<string, unknown> | null;
    failed_runs: unknown;
  }>(sql`
    select
      source.id as source_id,
      source.created_at,
      coalesce(source.sync_claim_expires_at > now(), false) as active_claim,
      latest.observed_at as latest_success_at,
      latest.observed_minute_of_day as latest_observed_minute_of_day,
      latest.observation_scope as latest_observation_scope,
      latest.scope_evidence as latest_scope_evidence,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'startedAt', run.started_at,
            'completedAt', run.completed_at,
            'errorCode', run.error_code
          )
          order by run.started_at, run.id
        ) filter (
          where run.status = 'failed'
            and coalesce(run.error_code, '') <> 'MENU_SYNC_SUPERSEDED'
        ),
        '[]'::jsonb
      ) as failed_runs
    from ${canteenMenuSources} as source
    left join lateral (
      select
        coalesce(snapshot.observed_at, success.started_at) as observed_at,
        snapshot.observed_minute_of_day,
        snapshot.observation_scope,
        snapshot.scope_evidence
      from ${canteenMenuSyncRuns} as success
      left join ${canteenMenuSyncSnapshots} as snapshot
        on snapshot.run_id = success.id
      where success.menu_source_id = source.id
        and success.status in ('applied', 'unchanged')
        and success.started_at >= ${window.claimsStartAt}
        and success.started_at < ${window.endsAt}
      order by success.started_at desc, success.id desc
      limit 1
    ) as latest on true
    left join ${canteenMenuSyncRuns} as run
      on run.menu_source_id = source.id
      and run.started_at >= ${window.claimsStartAt}
      and run.started_at < ${window.endsAt}
    where source.enabled = true
      and not (${window.hktWeekday} = any(source.closed_weekdays))
      and ${window.period} = any(source.sync_meal_periods)
      and ${sourceFilter}
    group by
      source.id,
      latest.observed_at,
      latest.observed_minute_of_day,
      latest.observation_scope,
      latest.scope_evidence
  `);
  return result.rows.flatMap((row) => {
    const latestObservedAt = parseDatabaseDate(row.latest_success_at);
    const latest: LatestMenuSourceObservation | null = latestObservedAt
      ? {
          observedAt: latestObservedAt,
          observedMinuteOfDay: Number(row.latest_observed_minute_of_day ?? -1),
          observationScope: row.latest_observation_scope,
          scopeEvidence: row.latest_scope_evidence ?? {},
        }
      : null;
    const dueAt = latest
      ? nextMenuSourceObservationAt(window, latest, databaseNow)
      : window.claimsStartAt;
    if (!dueAt || dueAt > databaseNow) return [];

    const failures = parseFailedRuns(row.failed_runs)
      .filter((failure) => failure.startedAt >= dueAt)
      .sort(
        (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
      );
    const latestFailure = failures[0] ?? null;
    return [
      {
        sourceId: row.source_id,
        createdAt: parseDatabaseDate(row.created_at)!,
        activeClaim: row.active_claim,
        failureCount: failures.length,
        latestErrorCode: latestFailure?.errorCode ?? null,
        latestFailedAt: latestFailure
          ? (latestFailure.completedAt ?? latestFailure.startedAt)
          : null,
      },
    ];
  });
}

export async function listMenuSourceScheduleCandidates(
  tx: MenuSyncTransaction,
  window: MenuSyncWindow,
  databaseNow: Date,
): Promise<MenuSourceScheduleCandidate[]> {
  if (!menuSyncWindowAcceptsActivity(window, databaseNow)) return [];
  const facts = await readMenuSourceScheduleFacts(tx, window, databaseNow);
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
  const facts = await readMenuSourceScheduleFacts(
    tx,
    window,
    databaseNow,
    sourceId,
  );
  return facts[0] ? classifyMenuSourceSchedule(facts[0], databaseNow) : null;
}
