INSERT INTO "campus_map_note_visibility" ("note_id", "visibility", "decision_ref", "updated_at")
SELECT "id", 'public', NULL, "updated_at"
FROM "campus_map_notes"
ON CONFLICT ("note_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "campus_map_note_event_visibility" ("event_id", "visibility", "decision_ref", "updated_at")
SELECT "id", 'public', NULL, "created_at"
FROM "campus_map_note_events"
ON CONFLICT ("event_id") DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION campus_map_guard_moderation_decision_mutation()
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

  RAISE EXCEPTION 'Campus Map moderation decisions are append-only'
    USING ERRCODE = '23514';
END;
$$
SET search_path = pg_catalog, public;
--> statement-breakpoint
CREATE TRIGGER campus_map_moderation_decisions_append_only
BEFORE UPDATE OR DELETE ON campus_map_moderation_decisions
FOR EACH ROW
EXECUTE FUNCTION campus_map_guard_moderation_decision_mutation();
--> statement-breakpoint
CREATE TRIGGER campus_map_moderation_decisions_append_only_truncate
BEFORE TRUNCATE ON campus_map_moderation_decisions
FOR EACH STATEMENT
EXECUTE FUNCTION campus_map_reject_ledger_mutation();
--> statement-breakpoint
CREATE FUNCTION campus_map_guard_report_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.reporter_user_id IS NOT NULL
     AND NEW.reporter_user_id IS NULL
     AND (to_jsonb(OLD) - 'reporter_user_id') = (to_jsonb(NEW) - 'reporter_user_id')
     AND NOT EXISTS (
       SELECT 1 FROM public.users WHERE id = OLD.reporter_user_id
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Campus Map reports are append-only'
    USING ERRCODE = '23514';
END;
$$
SET search_path = pg_catalog, public;
--> statement-breakpoint
CREATE TRIGGER campus_map_reports_append_only
BEFORE UPDATE OR DELETE ON campus_map_reports
FOR EACH ROW
EXECUTE FUNCTION campus_map_guard_report_mutation();
--> statement-breakpoint
CREATE TRIGGER campus_map_reports_append_only_truncate
BEFORE TRUNCATE ON campus_map_reports
FOR EACH STATEMENT
EXECUTE FUNCTION campus_map_reject_ledger_mutation();
