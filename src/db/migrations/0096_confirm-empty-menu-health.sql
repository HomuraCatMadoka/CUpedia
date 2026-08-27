-- Confirmed empty snapshots are successful completion evidence.
-- Pending empty confirmation is retry control flow, not a provider failure.
CREATE OR REPLACE FUNCTION canteen_menu_scheduler.window_health(
  from_time timestamptz,
  to_time timestamptz
)
RETURNS TABLE (
  sync_window_key text,
  primary_starts_at timestamptz,
  required_source_count integer,
  primary_completed_source_count integer,
  primary_completed_at timestamptz,
  fallback_completed_source_count integer,
  missing_tick_count integer,
  enqueue_failure_count integer,
  http_failure_count integer,
  endpoint_rejection_count integer,
  provider_failure_count integer,
  retry_later_count integer,
  review_required_count integer,
  inapplicable_run_count integer,
  classification text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF from_time IS NULL
    OR to_time IS NULL
    OR from_time > to_time
    OR to_time - from_time > interval '31 days' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_HEALTH_RANGE_INVALID',
      ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH ticks AS (
    SELECT *
    FROM canteen_menu_scheduler.delivery_health(from_time, to_time)
  ),
  windows AS (
    SELECT
      tick.sync_window_key,
      min(tick.expected_tick_at) AS primary_starts_at,
      count(*)::integer AS expected_tick_count,
      count(*) FILTER (
        WHERE tick.classification = 'cron-tick-missing'
      )::integer AS missing_tick_count,
      max(tick.expected_tick_at) FILTER (
        WHERE tick.classification = 'cron-tick-missing'
      ) AS last_missing_tick_at,
      max(tick.expected_tick_at) FILTER (
        WHERE tick.classification IN ('primary-progress', 'primary-no-work')
      ) AS last_recovery_tick_at,
      min(tick.completed_at) FILTER (
        WHERE tick.classification = 'primary-no-work'
      ) AS first_no_work_completed_at,
      count(*) FILTER (
        WHERE tick.classification IN ('enqueue-failed', 'evidence-unmatched')
      )::integer AS enqueue_failure_count,
      count(*) FILTER (
        WHERE tick.classification IN ('http-failed', 'http-timeout')
      )::integer AS http_failure_count,
      count(*) FILTER (
        WHERE tick.classification IN (
          'endpoint-auth-rejected',
          'endpoint-malformed'
        )
      )::integer AS endpoint_rejection_count,
      count(*) FILTER (
        WHERE tick.classification = 'provider-application-failed'
          AND COALESCE(tick.business_code, '') <>
            'MENU_SYNC_EMPTY_PENDING_CONFIRMATION'
      )::integer AS provider_failure_count,
      count(*) FILTER (
        WHERE tick.endpoint_disposition = 'retry-later'
      )::integer AS retry_later_count,
      count(*) FILTER (
        WHERE tick.classification = 'review-required'
      )::integer AS review_required_count
    FROM ticks AS tick
    GROUP BY tick.sync_window_key
  )
  SELECT
    window_row.sync_window_key,
    window_row.primary_starts_at,
    source_counts.required_source_count,
    source_counts.primary_completed_source_count,
    CASE
      WHEN window_row.expected_tick_count = 16
        AND window_row.missing_tick_count < window_row.expected_tick_count
        AND (
          window_row.missing_tick_count = 0
          OR window_row.last_missing_tick_at <
            window_row.last_recovery_tick_at
        )
        AND source_counts.required_source_count =
          source_counts.primary_completed_source_count
        THEN CASE
          WHEN source_counts.required_source_count = 0
            THEN window_row.first_no_work_completed_at
          ELSE source_counts.latest_primary_source_completed_at
        END
      ELSE NULL
    END AS primary_completed_at,
    source_counts.fallback_completed_source_count,
    window_row.missing_tick_count,
    window_row.enqueue_failure_count,
    window_row.http_failure_count,
    window_row.endpoint_rejection_count,
    window_row.provider_failure_count + run_counts.provider_failure_count,
    window_row.retry_later_count,
    window_row.review_required_count + run_counts.review_required_count,
    run_counts.inapplicable_run_count,
    CASE
      WHEN window_row.review_required_count + run_counts.review_required_count > 0
        THEN 'review-required'
      WHEN run_counts.inapplicable_run_count > 0
        THEN 'inapplicable-source-ran'
      WHEN window_row.expected_tick_count = 16
        AND window_row.missing_tick_count = window_row.expected_tick_count
        THEN 'cron-tick-missing'
      WHEN window_row.missing_tick_count > 0
        AND (
          window_row.last_recovery_tick_at IS NULL
          OR window_row.last_missing_tick_at >=
            window_row.last_recovery_tick_at
        ) THEN 'cron-tick-missing'
      WHEN source_counts.required_source_count =
        source_counts.primary_completed_source_count
        THEN 'primary-drained-window'
      WHEN source_counts.required_source_count =
        source_counts.fallback_completed_source_count
        AND source_counts.fallback_completed_source_count >
          source_counts.primary_completed_source_count
        THEN 'fallback-completed-window'
      WHEN window_row.retry_later_count > 0
        THEN 'retry-still-due'
      WHEN window_row.provider_failure_count + run_counts.provider_failure_count > 0
        THEN 'provider-application-failed'
      WHEN window_row.endpoint_rejection_count > 0
        THEN 'endpoint-rejected-or-malformed'
      WHEN window_row.http_failure_count > 0
        THEN 'http-failed'
      WHEN window_row.enqueue_failure_count > 0
        THEN 'enqueue-failed'
      WHEN window_row.missing_tick_count > 0
        THEN 'cron-tick-missing'
      ELSE 'incomplete'
    END
  FROM windows AS window_row
  CROSS JOIN LATERAL (
    SELECT
      count(*)::integer AS required_source_count,
      count(*) FILTER (
        WHERE source_completion.completed_at <=
          window_row.primary_starts_at + interval '18 minutes'
      )::integer AS primary_completed_source_count,
      max(source_completion.completed_at) FILTER (
        WHERE source_completion.completed_at <=
          window_row.primary_starts_at + interval '18 minutes'
      ) AS latest_primary_source_completed_at,
      count(*) FILTER (
        WHERE source_completion.completed_at <=
          window_row.primary_starts_at + interval '38 minutes'
      )::integer AS fallback_completed_source_count
    FROM (
      SELECT
        source.id,
        (
          SELECT min(run.completed_at)
          FROM public.canteen_menu_sync_runs AS run
          JOIN public.canteen_menu_sync_snapshots AS snapshot
            ON snapshot.run_id = run.id
          WHERE run.menu_source_id = source.id
            AND run.status IN ('applied', 'unchanged')
            AND run.started_at >= window_row.primary_starts_at
            AND run.completed_at <=
              window_row.primary_starts_at + interval '38 minutes'
            AND snapshot.sync_window_key = window_row.sync_window_key
        ) AS completed_at
      FROM public.canteen_menu_sources AS source
      WHERE source.enabled
        AND split_part(window_row.sync_window_key, '/', 2) =
          ANY(source.sync_meal_periods)
        AND extract(
          dow FROM window_row.primary_starts_at AT TIME ZONE 'Asia/Hong_Kong'
        )::integer <> ALL(source.closed_weekdays)
    ) AS source_completion
  ) AS source_counts
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(sum(
        CASE
          WHEN source_run.has_review_error OR source_run.failure_count >= 3
            THEN 0
          ELSE source_run.failure_count
        END
      ), 0)::integer AS provider_failure_count,
      count(*) FILTER (
        WHERE source_run.has_review_error OR source_run.failure_count >= 3
      )::integer AS review_required_count,
      COALESCE(sum(source_run.inapplicable_run_count), 0)::integer
        AS inapplicable_run_count
    FROM (
      SELECT
        source.id,
        count(*) FILTER (
          WHERE run.status = 'failed'
            AND COALESCE(run.error_code, '') NOT IN (
              'MENU_SYNC_SUPERSEDED',
              'MENU_SYNC_EMPTY_PENDING_CONFIRMATION'
            )
        )::integer AS failure_count,
        COALESCE(bool_or(
          run.status = 'failed'
          AND (
            left(COALESCE(run.error_code, ''), 8) = 'INVALID_'
            OR run.error_code IN (
              'MENU_SYNC_CONFLICT',
              'MENU_SYNC_IDENTITY_CHURN',
              'MENU_SYNC_SUSPICIOUS_DROP',
              'MENU_SYNC_RETRY_LIMIT'
            )
          )
        ), false) AS has_review_error,
        count(*) FILTER (
          WHERE NOT source.enabled
            OR split_part(window_row.sync_window_key, '/', 2) <>
              ALL(source.sync_meal_periods)
            OR extract(
              dow FROM window_row.primary_starts_at AT TIME ZONE 'Asia/Hong_Kong'
            )::integer = ANY(source.closed_weekdays)
        )::integer AS inapplicable_run_count
      FROM public.canteen_menu_sync_runs AS run
      JOIN public.canteen_menu_sources AS source
        ON source.id = run.menu_source_id
      WHERE run.started_at >= window_row.primary_starts_at
        AND run.started_at <
          window_row.primary_starts_at + interval '38 minutes'
      GROUP BY source.id
    ) AS source_run
  ) AS run_counts
  ORDER BY window_row.primary_starts_at;
END
$function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION canteen_menu_scheduler.window_health(timestamptz, timestamptz) FROM PUBLIC;
