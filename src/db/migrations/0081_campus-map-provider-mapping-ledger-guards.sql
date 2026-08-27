CREATE FUNCTION campus_map_guard_provider_mapping_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(OLD) - 'actor_user_id') = (to_jsonb(NEW) - 'actor_user_id')
     AND NOT EXISTS (
       SELECT 1 FROM public.users WHERE id = OLD.actor_user_id
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Campus Map provider mapping ledger is append-only'
    USING ERRCODE = '23514';
END;
$$
SET search_path = pg_catalog, public;
--> statement-breakpoint
CREATE TRIGGER campus_map_provider_mapping_events_append_only
BEFORE UPDATE OR DELETE ON campus_map_provider_mapping_events
FOR EACH ROW
EXECUTE FUNCTION campus_map_guard_provider_mapping_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER campus_map_provider_mapping_events_append_only_truncate
BEFORE TRUNCATE ON campus_map_provider_mapping_events
FOR EACH STATEMENT
EXECUTE FUNCTION campus_map_reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER campus_map_provider_mapping_requests_append_only
BEFORE UPDATE OR DELETE ON campus_map_provider_mapping_requests
FOR EACH ROW
EXECUTE FUNCTION campus_map_guard_provider_mapping_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER campus_map_provider_mapping_requests_append_only_truncate
BEFORE TRUNCATE ON campus_map_provider_mapping_requests
FOR EACH STATEMENT
EXECUTE FUNCTION campus_map_reject_ledger_mutation();
--> statement-breakpoint
ALTER TABLE campus_map_provider_mappings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE campus_map_provider_mapping_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE campus_map_provider_mapping_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE
      campus_map_provider_mappings,
      campus_map_provider_mapping_events,
      campus_map_provider_mapping_requests
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      campus_map_provider_mappings,
      campus_map_provider_mapping_events,
      campus_map_provider_mapping_requests
    FROM authenticated;
  END IF;
END;
$$;
