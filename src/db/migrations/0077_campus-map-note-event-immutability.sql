CREATE FUNCTION campus_map_guard_note_event_mutation()
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

  RAISE EXCEPTION 'Campus Map Note events are append-only'
    USING ERRCODE = '23514';
END;
$$
SET search_path = pg_catalog, public;
--> statement-breakpoint
CREATE TRIGGER campus_map_note_events_append_only
BEFORE UPDATE OR DELETE ON campus_map_note_events
FOR EACH ROW
EXECUTE FUNCTION campus_map_guard_note_event_mutation();
--> statement-breakpoint
CREATE TRIGGER campus_map_note_events_append_only_truncate
BEFORE TRUNCATE ON campus_map_note_events
FOR EACH STATEMENT
EXECUTE FUNCTION campus_map_reject_ledger_mutation();
