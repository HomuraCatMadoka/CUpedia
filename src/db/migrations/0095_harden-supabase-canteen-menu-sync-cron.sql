-- Migration 0094 is immutable once committed/applied. Harden its runtime
-- behavior here so databases that already recorded 0094 receive the fix.

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
EXCEPTION WHEN OTHERS THEN
  -- pg_net performs this insert in its background worker. Classifier and audit
  -- errors must not reject that insert when an unexpected response shape or a
  -- local audit constraint changes. Keep a bounded failure marker when possible
  -- and otherwise leave the response for pg_net's own TTL cleanup.
  BEGIN
    UPDATE canteen_menu_scheduler.delivery_audit
    SET http_status = NULL,
        delivery_error = 'transport-error',
        endpoint_disposition = NULL,
        business_code = NULL,
        completed_at = COALESCE(NEW.created, clock_timestamp())
    WHERE request_id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END
$function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION canteen_menu_scheduler.capture_http_response() FROM PUBLIC;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION canteen_menu_scheduler.guard_activation_runtime()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  pg_net_ttl interval;
BEGIN
  IF NOT NEW.active THEN
    RETURN NEW;
  END IF;

  BEGIN
    pg_net_ttl := NULLIF(current_setting('pg_net.ttl', true), '')::interval;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_PG_NET_TTL_INVALID',
      ERRCODE = 'P0001';
  END;

  IF pg_net_ttl IS NULL
    OR pg_net_ttl <= interval '0 seconds'
    OR pg_net_ttl > interval '6 hours' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_PG_NET_TTL_INVALID',
      ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('net.check_worker_is_up()') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_PG_NET_WORKER_UNAVAILABLE',
      ERRCODE = 'P0001';
  END IF;

  BEGIN
    EXECUTE 'SELECT net.check_worker_is_up()';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING
      MESSAGE = 'CANTEEN_MENU_SYNC_PG_NET_WORKER_UNAVAILABLE',
      ERRCODE = 'P0001';
  END;

  RETURN NEW;
END
$function$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION canteen_menu_scheduler.guard_activation_runtime() FROM PUBLIC;
--> statement-breakpoint

DO $client_roles$
DECLARE
  client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION '
        'canteen_menu_scheduler.capture_http_response() FROM %I',
        client_role
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION '
        'canteen_menu_scheduler.guard_activation_runtime() FROM %I',
        client_role
      );
    END IF;
  END LOOP;
END
$client_roles$;
--> statement-breakpoint

CREATE OR REPLACE TRIGGER canteen_menu_scheduler_guard_activation_runtime
BEFORE INSERT OR UPDATE OF active
ON canteen_menu_scheduler.activation
FOR EACH ROW
WHEN (NEW.active)
EXECUTE FUNCTION canteen_menu_scheduler.guard_activation_runtime();
