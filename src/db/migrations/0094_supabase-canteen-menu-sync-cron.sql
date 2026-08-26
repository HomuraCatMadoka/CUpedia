-- Supabase owns the primary breakfast/lunch/dinner wake-up clock. The menu
-- synchronization state machine remains in the application and its existing
-- /next route. Stock PostgreSQL development databases do not ship these
-- extensions, so they keep the private objects below but skip job installation.
DO $extensions$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions';
  END IF;
END
$extensions$;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS canteen_menu_scheduler;
--> statement-breakpoint
REVOKE ALL ON SCHEMA canteen_menu_scheduler FROM PUBLIC;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS canteen_menu_scheduler.activation (
  singleton boolean PRIMARY KEY DEFAULT true,
  environment text DEFAULT 'unconfigured' NOT NULL,
  active boolean DEFAULT false NOT NULL,
  activated_at timestamptz,
  deactivated_at timestamptz,
  updated_at timestamptz DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT canteen_menu_scheduler_activation_singleton_chk CHECK (singleton),
  CONSTRAINT canteen_menu_scheduler_activation_environment_chk
    CHECK (environment IN ('unconfigured', 'production')),
  CONSTRAINT canteen_menu_scheduler_activation_production_chk
    CHECK (NOT active OR environment = 'production')
);
--> statement-breakpoint
ALTER TABLE canteen_menu_scheduler.activation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS canteen_menu_scheduler.delivery_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expected_tick_at timestamptz NOT NULL,
  sync_window_key text NOT NULL,
  cron_run_id bigint,
  request_id bigint NOT NULL,
  request_created_at timestamptz DEFAULT clock_timestamp() NOT NULL,
  http_status integer,
  delivery_error text,
  endpoint_disposition text,
  business_code text,
  completed_at timestamptz,
  CONSTRAINT canteen_menu_scheduler_delivery_request_uidx UNIQUE (request_id),
  CONSTRAINT canteen_menu_scheduler_delivery_window_chk
    CHECK (sync_window_key ~ '^\d{4}-\d{2}-\d{2}/(breakfast|lunch|dinner)$'),
  CONSTRAINT canteen_menu_scheduler_delivery_http_status_chk
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT canteen_menu_scheduler_delivery_error_chk CHECK (
    delivery_error IS NULL OR delivery_error IN (
      'timeout',
      'connection-failed',
      'transport-error',
      'http-non-2xx',
      'malformed-json',
      'unsupported-disposition'
    )
  ),
  CONSTRAINT canteen_menu_scheduler_delivery_disposition_chk CHECK (
    endpoint_disposition IS NULL OR endpoint_disposition IN (
      'continue',
      'retry-later',
      'stop-for-review',
      'no-work'
    )
  ),
  CONSTRAINT canteen_menu_scheduler_delivery_business_code_chk
    CHECK (business_code IS NULL OR length(business_code) BETWEEN 1 AND 80),
  CONSTRAINT canteen_menu_scheduler_delivery_completion_chk CHECK (
    completed_at IS NULL OR http_status IS NOT NULL OR delivery_error IS NOT NULL
  )
);
--> statement-breakpoint
ALTER TABLE canteen_menu_scheduler.delivery_audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canteen_menu_scheduler_delivery_retention_idx
  ON canteen_menu_scheduler.delivery_audit (request_created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canteen_menu_scheduler_delivery_tick_idx
  ON canteen_menu_scheduler.delivery_audit (expected_tick_at, request_created_at);
--> statement-breakpoint

REVOKE ALL ON TABLE canteen_menu_scheduler.activation FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE canteen_menu_scheduler.delivery_audit FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE canteen_menu_scheduler.delivery_audit_id_seq FROM PUBLIC;
--> statement-breakpoint

-- Replaying setup always returns to the reviewed fail-closed state. Production
-- activation is a separate, explicit runbook action after Vault provisioning.
INSERT INTO canteen_menu_scheduler.activation (
  singleton,
  environment,
  active,
  activated_at,
  deactivated_at,
  updated_at
)
VALUES (true, 'unconfigured', false, NULL, clock_timestamp(), clock_timestamp())
ON CONFLICT (singleton) DO UPDATE
SET environment = 'unconfigured',
    active = false,
    activated_at = NULL,
    deactivated_at = clock_timestamp(),
    updated_at = clock_timestamp();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.capture_http_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  response_payload jsonb;
  result_payload jsonb;
  expected_window_key text;
  parsed_disposition text;
  parsed_business_code text;
  parsed_source_id text;
  parsed_window text;
  result_source_id text;
  result_status text;
  result_code text;
  result_item_count numeric;
  classified_error text;
BEGIN
  SELECT sync_window_key
  INTO expected_window_key
  FROM canteen_menu_scheduler.delivery_audit
  WHERE request_id = NEW.id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.timed_out THEN
    classified_error := 'timeout';
  ELSIF NULLIF(btrim(NEW.error_msg), '') IS NOT NULL THEN
    classified_error := CASE
      WHEN lower(NEW.error_msg) ~ '(connect|connection|resolve|dns|host)'
        THEN 'connection-failed'
      ELSE 'transport-error'
    END;
  ELSIF NEW.status_code IS NULL
    OR NEW.status_code < 200
    OR NEW.status_code >= 300 THEN
    classified_error := 'http-non-2xx';
  ELSE
    BEGIN
      response_payload := NEW.content::jsonb;
    EXCEPTION WHEN OTHERS THEN
      classified_error := 'malformed-json';
    END;

    IF classified_error IS NULL THEN
      parsed_disposition := response_payload ->> 'disposition';
      IF parsed_disposition IS NULL OR parsed_disposition NOT IN (
        'continue',
        'retry-later',
        'stop-for-review',
        'no-work'
      ) THEN
        classified_error := 'unsupported-disposition';
        parsed_disposition := NULL;
      END IF;
    END IF;

    IF classified_error IS NULL THEN
      parsed_window := response_payload ->> 'window';
      IF parsed_window IS NULL
        OR parsed_window !~
          '^\d{4}-\d{2}-\d{2}/(breakfast|lunch|dinner)$'
        OR parsed_window <> expected_window_key THEN
        classified_error := 'malformed-json';
      END IF;
    END IF;

    IF classified_error IS NULL AND parsed_disposition <> 'no-work' THEN
      parsed_source_id := response_payload ->> 'sourceId';
      IF NULLIF(btrim(parsed_source_id), '') IS NULL THEN
        classified_error := 'malformed-json';
      END IF;
    END IF;

    IF classified_error IS NULL
      AND (
        parsed_disposition = 'continue'
        OR response_payload ? 'result'
      ) THEN
      result_payload := response_payload -> 'result';
      IF result_payload IS NULL OR jsonb_typeof(result_payload) <> 'object' THEN
        classified_error := 'malformed-json';
      ELSE
        result_source_id := result_payload ->> 'sourceId';
        result_status := result_payload ->> 'status';
        result_code := result_payload ->> 'code';

        IF NULLIF(btrim(result_source_id), '') IS NULL
          OR result_source_id <> parsed_source_id
          OR NULLIF(btrim(result_status), '') IS NULL
          OR NULLIF(btrim(result_code), '') IS NULL THEN
          classified_error := 'malformed-json';
        ELSIF parsed_disposition = 'continue'
          AND result_status NOT IN (
            'applied',
            'unchanged',
            'source-unavailable'
          ) THEN
          classified_error := 'malformed-json';
        ELSIF parsed_disposition = 'retry-later'
          AND result_status NOT IN (
            'provider-failure',
            'internal-failure',
            'superseded'
          ) THEN
          classified_error := 'malformed-json';
        ELSIF parsed_disposition = 'stop-for-review'
          AND result_status NOT IN (
            'blocked',
            'provider-failure',
            'internal-failure'
          ) THEN
          classified_error := 'malformed-json';
        ELSIF result_status = 'applied'
          AND result_code <> 'MENU_SYNC_APPLIED' THEN
          classified_error := 'malformed-json';
        ELSIF result_status = 'unchanged'
          AND result_code <> 'MENU_SYNC_UNCHANGED' THEN
          classified_error := 'malformed-json';
        ELSIF result_status = 'source-unavailable'
          AND result_code NOT IN (
            'MENU_SOURCE_NOT_FOUND',
            'MENU_SOURCE_DISABLED'
          ) THEN
          classified_error := 'malformed-json';
        ELSIF result_status = 'blocked'
          AND result_code NOT IN (
            'MENU_SYNC_CONFLICT',
            'MENU_SYNC_IDENTITY_CHURN',
            'MENU_SYNC_SUSPICIOUS_DROP'
          ) THEN
          classified_error := 'malformed-json';
        ELSIF result_status = 'superseded'
          AND result_code <> 'MENU_SYNC_SUPERSEDED' THEN
          classified_error := 'malformed-json';
        ELSIF result_status IN ('applied', 'unchanged') THEN
          IF jsonb_typeof(result_payload -> 'itemCount') <> 'number' THEN
            classified_error := 'malformed-json';
          ELSE
            result_item_count := (result_payload ->> 'itemCount')::numeric;
            IF result_item_count < 0
              OR trunc(result_item_count) <> result_item_count
              OR result_item_count > 9007199254740991 THEN
              classified_error := 'malformed-json';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    IF classified_error IS NULL THEN
      parsed_business_code := CASE parsed_disposition
        WHEN 'continue' THEN result_code
        WHEN 'retry-later' THEN response_payload ->> 'code'
        WHEN 'stop-for-review' THEN response_payload ->> 'code'
        ELSE NULL
      END;

      IF parsed_disposition IN ('retry-later', 'stop-for-review')
        AND NULLIF(btrim(parsed_business_code), '') IS NULL THEN
        classified_error := 'malformed-json';
      ELSIF parsed_business_code IS NOT NULL THEN
        parsed_business_code := left(parsed_business_code, 80);
      END IF;
    END IF;

    IF classified_error IS NOT NULL THEN
      parsed_disposition := NULL;
      parsed_window := NULL;
      parsed_business_code := NULL;
    END IF;
  END IF;

  UPDATE canteen_menu_scheduler.delivery_audit
  SET http_status = NEW.status_code,
      delivery_error = classified_error,
      endpoint_disposition = parsed_disposition,
      business_code = parsed_business_code,
      completed_at = COALESCE(NEW.created, clock_timestamp())
  WHERE request_id = NEW.id;

  RETURN NEW;
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.prune_delivery_evidence(
  reviewed_job_id bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  audit_rows_deleted integer;
BEGIN
  DELETE FROM canteen_menu_scheduler.delivery_audit
  WHERE id IN (
    SELECT id
    FROM canteen_menu_scheduler.delivery_audit
    WHERE request_created_at < clock_timestamp() - interval '14 days'
    ORDER BY request_created_at
    LIMIT 500
  );
  GET DIAGNOSTICS audit_rows_deleted = ROW_COUNT;

  IF reviewed_job_id IS NOT NULL
    AND to_regclass('cron.job_run_details') IS NOT NULL THEN
    DELETE FROM cron.job_run_details
    WHERE runid IN (
      SELECT runid
      FROM cron.job_run_details
      WHERE jobid = reviewed_job_id
        AND start_time < clock_timestamp() - interval '14 days'
      ORDER BY start_time
      LIMIT 500
    );
  END IF;

  RETURN audit_rows_deleted;
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  activation_environment text;
  scheduler_active boolean;
  bearer_token text;
  current_job_id bigint;
  current_cron_run_id bigint;
  queued_request_id bigint;
  expected_tick timestamptz;
  utc_hour integer;
  utc_minute integer;
  meal_period text;
  window_key text;
BEGIN
  SELECT environment, active
  INTO activation_environment, scheduler_active
  FROM canteen_menu_scheduler.activation
  WHERE singleton;

  IF NOT FOUND
    OR activation_environment <> 'production'
    OR NOT scheduler_active THEN
    RETURN NULL;
  END IF;

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_SCHEDULER_OWNER_INVALID',
      ERRCODE = '42501';
  END IF;

  expected_tick := date_trunc('minute', clock_timestamp());
  utc_hour := extract(hour FROM expected_tick AT TIME ZONE 'UTC')::integer;
  utc_minute := extract(minute FROM expected_tick AT TIME ZONE 'UTC')::integer;

  IF utc_hour NOT IN (0, 3, 9) OR utc_minute NOT BETWEEN 17 AND 32 THEN
    RETURN NULL;
  END IF;

  meal_period := CASE utc_hour
    WHEN 0 THEN 'breakfast'
    WHEN 3 THEN 'lunch'
    WHEN 9 THEN 'dinner'
  END;
  window_key := to_char(
    expected_tick AT TIME ZONE 'Asia/Hong_Kong',
    'YYYY-MM-DD'
  ) || '/' || meal_period;

  SELECT jobid
  INTO current_job_id
  FROM cron.job
  WHERE jobname = 'cupedia-canteen-menu-sync-wakeup'
    AND username = current_user;

  IF current_job_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_CRON_JOB_MISSING',
      ERRCODE = 'P0001';
  END IF;

  PERFORM canteen_menu_scheduler.prune_delivery_evidence(current_job_id);

  SELECT details.runid
  INTO current_cron_run_id
  FROM cron.job_run_details AS details
  WHERE details.jobid = current_job_id
    AND details.job_pid = pg_backend_pid()
  ORDER BY details.start_time DESC
  LIMIT 1;

  SELECT decrypted_secret
  INTO bearer_token
  FROM vault.decrypted_secrets
  WHERE name = 'cupedia_canteen_menu_sync_bearer'
    AND NULLIF(btrim(decrypted_secret), '') IS NOT NULL;

  IF bearer_token IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_VAULT_SECRET_MISSING',
      ERRCODE = 'P0001';
  END IF;

  BEGIN
    SELECT net.http_post(
      url := 'https://cupedia.org/api/internal/canteen-menu-sync/next',
      body := '{}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || bearer_token
      ),
      timeout_milliseconds := 65000
    )
    INTO queued_request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_ENQUEUE_FAILED',
      ERRCODE = 'P0001';
  END;

  bearer_token := NULL;

  INSERT INTO canteen_menu_scheduler.delivery_audit (
    expected_tick_at,
    sync_window_key,
    cron_run_id,
    request_id,
    request_created_at
  )
  VALUES (
    expected_tick,
    window_key,
    current_cron_run_id,
    queued_request_id,
    clock_timestamp()
  );

  RETURN queued_request_id;
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.reconcile_job()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  reconciled_job_id bigint;
  duplicate_job_id bigint;
  duplicate_job_owner text;
  invoker_role text := current_user;
  had_invoker_grant boolean;
  invoker_grant_set_option boolean;
  invoker_can_set_role boolean;
  matching_job_count integer;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_SCHEDULER_OWNER_INVALID',
      ERRCODE = '42501';
  END IF;

  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL
    OR to_regprocedure(
      'cron.alter_job(bigint,text,text,text,text,boolean)'
    ) IS NULL
    OR to_regprocedure('cron.unschedule(bigint)') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_CRON_EXTENSION_MISSING',
      ERRCODE = 'P0001';
  END IF;

  SELECT jobid
  INTO reconciled_job_id
  FROM cron.job
  WHERE jobname = 'cupedia-canteen-menu-sync-wakeup'
    AND username = current_user
  ORDER BY jobid
  LIMIT 1;

  FOR duplicate_job_id, duplicate_job_owner IN
    SELECT jobid, username
    FROM cron.job
    WHERE jobname = 'cupedia-canteen-menu-sync-wakeup'
      AND (
        reconciled_job_id IS NULL
        OR jobid <> reconciled_job_id
    )
    ORDER BY jobid
  LOOP
    -- pg_cron deliberately lets a role manage only its own jobs. A deployment
    -- role that already administers the stale owner may temporarily SET ROLE
    -- so cleanup still goes through cron.unschedule instead of cron.job writes.
    IF duplicate_job_owner <> invoker_role THEN
      SELECT COALESCE(bool_or(membership.set_option), false)
      INTO invoker_can_set_role
      FROM pg_auth_members AS membership
      WHERE membership.roleid = (
          SELECT oid FROM pg_roles WHERE rolname = duplicate_job_owner
        )
        AND membership.member = (
          SELECT oid FROM pg_roles WHERE rolname = invoker_role
        );

      SELECT true, membership.set_option
      INTO had_invoker_grant, invoker_grant_set_option
      FROM pg_auth_members AS membership
      WHERE membership.roleid = (
          SELECT oid FROM pg_roles WHERE rolname = duplicate_job_owner
        )
        AND membership.member = (
          SELECT oid FROM pg_roles WHERE rolname = invoker_role
        )
        AND membership.grantor = (
          SELECT oid FROM pg_roles WHERE rolname = invoker_role
        );

      IF NOT invoker_can_set_role THEN
        EXECUTE format(
          'GRANT %I TO %I WITH SET TRUE',
          duplicate_job_owner,
          invoker_role
        );
      END IF;

      EXECUTE format('SET LOCAL ROLE %I', duplicate_job_owner);
    END IF;

    PERFORM cron.unschedule(duplicate_job_id);

    IF duplicate_job_owner <> invoker_role THEN
      RESET ROLE;

      IF NOT invoker_can_set_role THEN
        IF COALESCE(had_invoker_grant, false) THEN
          EXECUTE format(
            'GRANT %I TO %I WITH SET FALSE',
            duplicate_job_owner,
            invoker_role
          );
        ELSE
          EXECUTE format(
            'REVOKE %I FROM %I GRANTED BY %I',
            duplicate_job_owner,
            invoker_role,
            invoker_role
          );
        END IF;
      END IF;
    END IF;

    had_invoker_grant := NULL;
    invoker_grant_set_option := NULL;
    invoker_can_set_role := NULL;
  END LOOP;

  IF reconciled_job_id IS NULL THEN
    SELECT cron.schedule(
      'cupedia-canteen-menu-sync-wakeup',
      '17-32 0,3,9 * * *',
      'SELECT canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()'
    )
    INTO reconciled_job_id;
  END IF;

  PERFORM cron.alter_job(
    reconciled_job_id,
    schedule := '17-32 0,3,9 * * *',
    command :=
      'SELECT canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()',
    database := current_database(),
    active := false
  );

  SELECT count(*)::integer
  INTO matching_job_count
  FROM cron.job
  WHERE jobname = 'cupedia-canteen-menu-sync-wakeup';

  IF matching_job_count <> 1 OR NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = reconciled_job_id
      AND jobname = 'cupedia-canteen-menu-sync-wakeup'
      AND schedule = '17-32 0,3,9 * * *'
      AND command =
        'SELECT canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()'
      AND database = current_database()
      AND username = current_user
      AND NOT active
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_CRON_JOB_DID_NOT_CONVERGE',
      ERRCODE = 'P0001';
  END IF;

  UPDATE canteen_menu_scheduler.activation
  SET environment = 'unconfigured',
      active = false,
      activated_at = NULL,
      deactivated_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE singleton;

  RETURN reconciled_job_id;
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.activate()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  reviewed_job_id bigint;
  named_job_count integer;
  secret_count integer;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_SCHEDULER_OWNER_INVALID',
      ERRCODE = '42501';
  END IF;

  IF COALESCE(upper(current_setting('cron.timezone', true)), '')
    NOT IN ('GMT', 'UTC', 'ETC/GMT', 'ETC/UTC') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_CRON_TIMEZONE_INVALID',
      ERRCODE = 'P0001';
  END IF;

  SELECT
    count(*)::integer,
    max(jobid) FILTER (
      WHERE schedule = '17-32 0,3,9 * * *'
        AND command =
          'SELECT canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()'
        AND database = current_database()
        AND username = current_user
    )
  INTO named_job_count, reviewed_job_id
  FROM cron.job
  WHERE jobname = 'cupedia-canteen-menu-sync-wakeup';

  IF named_job_count <> 1 OR reviewed_job_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_CRON_JOB_NOT_REVIEWED',
      ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer
  INTO secret_count
  FROM vault.decrypted_secrets
  WHERE name = 'cupedia_canteen_menu_sync_bearer'
    AND NULLIF(btrim(decrypted_secret), '') IS NOT NULL;

  IF secret_count <> 1 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_VAULT_SECRET_MISSING',
      ERRCODE = 'P0001';
  END IF;

  UPDATE canteen_menu_scheduler.activation
  SET environment = 'production',
      active = true,
      activated_at = clock_timestamp(),
      deactivated_at = NULL,
      updated_at = clock_timestamp()
  WHERE singleton;

  PERFORM cron.alter_job(reviewed_job_id, active := true);
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.deactivate()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  reviewed_job_id bigint;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_SCHEDULER_OWNER_INVALID',
      ERRCODE = '42501';
  END IF;

  UPDATE canteen_menu_scheduler.activation
  SET active = false,
      deactivated_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE singleton;

  SELECT jobid
  INTO reviewed_job_id
  FROM cron.job
  WHERE jobname = 'cupedia-canteen-menu-sync-wakeup'
    AND username = current_user;

  IF reviewed_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(reviewed_job_id, active := false);
  END IF;
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.delivery_health(
  from_time timestamptz,
  to_time timestamptz
)
RETURNS TABLE (
  expected_tick_at timestamptz,
  sync_window_key text,
  cron_run_id bigint,
  cron_status text,
  request_id bigint,
  http_status integer,
  delivery_error text,
  endpoint_disposition text,
  business_code text,
  completed_at timestamptz,
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
  WITH expected AS (
    SELECT tick AS expected_tick_at,
      to_char(tick AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD') || '/' ||
      CASE extract(hour FROM tick AT TIME ZONE 'UTC')::integer
        WHEN 0 THEN 'breakfast'
        WHEN 3 THEN 'lunch'
        WHEN 9 THEN 'dinner'
      END AS sync_window_key
    FROM generate_series(
      date_trunc('minute', from_time),
      date_trunc('minute', to_time),
      interval '1 minute'
    ) AS tick
    WHERE extract(hour FROM tick AT TIME ZONE 'UTC')::integer IN (0, 3, 9)
      AND extract(minute FROM tick AT TIME ZONE 'UTC')::integer BETWEEN 17 AND 32
  ),
  reviewed_job AS (
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'cupedia-canteen-menu-sync-wakeup'
      AND username = current_user
  )
  SELECT
    expected.expected_tick_at,
    expected.sync_window_key,
    COALESCE(audit.cron_run_id, cron_run.runid),
    cron_run.status,
    audit.request_id,
    audit.http_status,
    audit.delivery_error,
    audit.endpoint_disposition,
    audit.business_code,
    audit.completed_at,
    CASE
      WHEN audit.cron_run_id IS NOT NULL AND cron_run.runid IS NULL
        THEN 'evidence-unmatched'
      WHEN cron_run.runid IS NULL
        THEN 'cron-tick-missing'
      WHEN cron_run.status = 'failed'
        OR (cron_run.status = 'succeeded' AND audit.request_id IS NULL)
        THEN 'enqueue-failed'
      WHEN audit.request_id IS NOT NULL AND audit.completed_at IS NULL
        THEN 'http-pending'
      WHEN audit.delivery_error = 'timeout'
        THEN 'http-timeout'
      WHEN audit.http_status IN (401, 403)
        THEN 'endpoint-auth-rejected'
      WHEN audit.delivery_error IN (
        'malformed-json',
        'unsupported-disposition'
      ) THEN 'endpoint-malformed'
      WHEN audit.delivery_error IS NOT NULL
        OR audit.http_status IS NULL
        OR audit.http_status < 200
        OR audit.http_status >= 300
        THEN 'http-failed'
      WHEN audit.endpoint_disposition = 'stop-for-review'
        THEN 'review-required'
      WHEN audit.endpoint_disposition = 'retry-later'
        THEN 'provider-application-failed'
      WHEN audit.endpoint_disposition = 'continue'
        THEN 'primary-progress'
      WHEN audit.endpoint_disposition = 'no-work'
        THEN 'primary-no-work'
      ELSE 'endpoint-malformed'
    END
  FROM expected
  LEFT JOIN LATERAL (
    SELECT delivery.*
    FROM canteen_menu_scheduler.delivery_audit AS delivery
    WHERE delivery.expected_tick_at = expected.expected_tick_at
    ORDER BY delivery.request_created_at DESC, delivery.id DESC
    LIMIT 1
  ) AS audit ON true
  LEFT JOIN LATERAL (
    SELECT details.runid, details.status
    FROM cron.job_run_details AS details
    WHERE details.jobid = (SELECT jobid FROM reviewed_job)
      AND date_trunc('minute', details.start_time) = expected.expected_tick_at
      AND (
        audit.cron_run_id IS NULL
        OR details.runid = audit.cron_run_id
      )
    ORDER BY details.start_time DESC, details.runid DESC
    LIMIT 1
  ) AS cron_run ON true
  ORDER BY expected.expected_tick_at;
END
$function$;
--> statement-breakpoint

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
            AND snapshot.item_count > 0
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
            AND COALESCE(run.error_code, '') <> 'MENU_SYNC_SUPERSEDED'
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

REVOKE ALL ON FUNCTION canteen_menu_scheduler.capture_http_response() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION canteen_menu_scheduler.prune_delivery_evidence(bigint) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION canteen_menu_scheduler.reconcile_job() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION canteen_menu_scheduler.activate() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION canteen_menu_scheduler.deactivate() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION canteen_menu_scheduler.delivery_health(timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION canteen_menu_scheduler.window_health(timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint

DO $client_roles$
DECLARE
  client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format(
        'REVOKE ALL ON SCHEMA canteen_menu_scheduler FROM %I',
        client_role
      );
      EXECUTE format(
        'REVOKE ALL ON ALL TABLES IN SCHEMA canteen_menu_scheduler FROM %I',
        client_role
      );
      EXECUTE format(
        'REVOKE ALL ON ALL SEQUENCES IN SCHEMA canteen_menu_scheduler FROM %I',
        client_role
      );
      EXECUTE format(
        'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA canteen_menu_scheduler FROM %I',
        client_role
      );
    END IF;
  END LOOP;
END
$client_roles$;
--> statement-breakpoint

DO $supabase_scheduler$
BEGIN
  IF to_regclass('net._http_response') IS NOT NULL THEN
    EXECUTE
      'CREATE OR REPLACE TRIGGER canteen_menu_scheduler_capture_response '
      'AFTER INSERT ON net._http_response FOR EACH ROW '
      'EXECUTE FUNCTION canteen_menu_scheduler.capture_http_response()';
  END IF;

  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL
    AND to_regprocedure(
      'cron.alter_job(bigint,text,text,text,text,boolean)'
    ) IS NOT NULL
    AND to_regprocedure('cron.unschedule(bigint)') IS NOT NULL
    AND to_regprocedure(
      'net.http_post(text,jsonb,jsonb,jsonb,integer)'
    ) IS NOT NULL
    AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    PERFORM canteen_menu_scheduler.reconcile_job();
  END IF;
END
$supabase_scheduler$;
