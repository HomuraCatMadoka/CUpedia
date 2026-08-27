CREATE TABLE "campus_map_contributor_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_user_id" uuid,
	"contributor_id_snapshot" uuid NOT NULL,
	"scope" text NOT NULL,
	"reason" text NOT NULL,
	"created_by_actor_id_snapshot" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"needs_acknowledgement" boolean DEFAULT false NOT NULL,
	"created_decision_ref" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_actor_id_snapshot" uuid,
	"revoked_decision_ref" text,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_contributor_blocks_created_decision_ref_unique" UNIQUE("created_decision_ref"),
	CONSTRAINT "campus_map_contributor_blocks_revoked_decision_ref_unique" UNIQUE("revoked_decision_ref"),
	CONSTRAINT "campus_map_contributor_blocks_scope_check" CHECK ("campus_map_contributor_blocks"."scope" in ('publish', 'map-notes', 'all')),
	CONSTRAINT "campus_map_contributor_blocks_time_check" CHECK ("campus_map_contributor_blocks"."ends_at" is null or "campus_map_contributor_blocks"."ends_at" > "campus_map_contributor_blocks"."starts_at"),
	CONSTRAINT "campus_map_contributor_blocks_revocation_check" CHECK (("campus_map_contributor_blocks"."revoked_at" is null and "campus_map_contributor_blocks"."revoked_by_actor_id_snapshot" is null and "campus_map_contributor_blocks"."revoked_decision_ref" is null and "campus_map_contributor_blocks"."revoke_reason" is null)
        or ("campus_map_contributor_blocks"."revoked_at" is not null and "campus_map_contributor_blocks"."revoked_by_actor_id_snapshot" is not null and "campus_map_contributor_blocks"."revoked_decision_ref" is not null and btrim("campus_map_contributor_blocks"."revoke_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "campus_map_moderation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"signals" text[] NOT NULL,
	"report_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_moderation_cases_target_kind_check" CHECK ("campus_map_moderation_cases"."target_kind" in ('changeset', 'revision', 'map-note', 'map-note-event', 'actor')),
	CONSTRAINT "campus_map_moderation_cases_status_check" CHECK ("campus_map_moderation_cases"."status" in ('open', 'ignored', 'resolved', 'reopened')),
	CONSTRAINT "campus_map_moderation_cases_revision_check" CHECK ("campus_map_moderation_cases"."revision" > 0 and "campus_map_moderation_cases"."report_count" > 0 and cardinality("campus_map_moderation_cases"."signals") > 0)
);
--> statement-breakpoint
CREATE TABLE "campus_map_moderation_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_ref" text NOT NULL,
	"command_kind" text NOT NULL,
	"case_id" uuid,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"actor_nickname_snapshot" text NOT NULL,
	"reason" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_moderation_decisions_decision_ref_unique" UNIQUE("decision_ref"),
	CONSTRAINT "campus_map_moderation_decisions_kind_check" CHECK ("campus_map_moderation_decisions"."command_kind" in ('decide-case', 'hide-map-note', 'unhide-map-note', 'hide-map-note-event', 'unhide-map-note-event', 'redact-revision', 'revoke-revision-redaction', 'block-contributor', 'revoke-contributor-block')),
	CONSTRAINT "campus_map_moderation_decisions_target_kind_check" CHECK ("campus_map_moderation_decisions"."target_kind" in ('changeset', 'revision', 'map-note', 'map-note-event', 'actor')),
	CONSTRAINT "campus_map_moderation_decisions_reason_check" CHECK (btrim("campus_map_moderation_decisions"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "campus_map_moderation_rate_limits" (
	"scope" text NOT NULL,
	"subject_hash" text NOT NULL,
	"window_kind" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_moderation_rate_limits_scope_subject_hash_window_kind_pk" PRIMARY KEY("scope","subject_hash","window_kind"),
	CONSTRAINT "campus_map_moderation_rate_limits_scope_check" CHECK ("campus_map_moderation_rate_limits"."scope" in ('actor', 'ip')),
	CONSTRAINT "campus_map_moderation_rate_limits_window_check" CHECK ("campus_map_moderation_rate_limits"."window_kind" in ('burst', 'sustained')),
	CONSTRAINT "campus_map_moderation_rate_limits_hash_check" CHECK (char_length("campus_map_moderation_rate_limits"."subject_hash") = 64),
	CONSTRAINT "campus_map_moderation_rate_limits_attempt_check" CHECK ("campus_map_moderation_rate_limits"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campus_map_moderation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"command_kind" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campus_map_note_event_visibility" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"decision_ref" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_note_event_visibility_check" CHECK (("campus_map_note_event_visibility"."visibility" = 'public' and "campus_map_note_event_visibility"."decision_ref" is null)
        or ("campus_map_note_event_visibility"."visibility" = 'hidden' and "campus_map_note_event_visibility"."decision_ref" is not null))
);
--> statement-breakpoint
CREATE TABLE "campus_map_note_visibility" (
	"note_id" uuid PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"decision_ref" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_note_visibility_check" CHECK (("campus_map_note_visibility"."visibility" = 'public' and "campus_map_note_visibility"."decision_ref" is null)
        or ("campus_map_note_visibility"."visibility" = 'hidden' and "campus_map_note_visibility"."decision_ref" is not null))
);
--> statement-breakpoint
CREATE TABLE "campus_map_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"reporter_id_snapshot" uuid NOT NULL,
	"reporter_nickname_snapshot" text NOT NULL,
	"signal" text NOT NULL,
	"details" text NOT NULL,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_reports_signal_check" CHECK ("campus_map_reports"."signal" in ('privacy', 'copyright', 'harassment', 'spam', 'vandalism', 'other')),
	CONSTRAINT "campus_map_reports_details_check" CHECK (btrim("campus_map_reports"."details") <> '')
);
--> statement-breakpoint
ALTER TABLE "campus_map_contributor_blocks" ADD CONSTRAINT "campus_map_contributor_blocks_contributor_user_id_users_id_fk" FOREIGN KEY ("contributor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_moderation_decisions" ADD CONSTRAINT "campus_map_moderation_decisions_case_id_campus_map_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."campus_map_moderation_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_moderation_decisions" ADD CONSTRAINT "campus_map_moderation_decisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_moderation_requests" ADD CONSTRAINT "campus_map_moderation_requests_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_event_visibility" ADD CONSTRAINT "campus_map_note_event_visibility_event_id_campus_map_note_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."campus_map_note_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_visibility" ADD CONSTRAINT "campus_map_note_visibility_note_id_campus_map_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."campus_map_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_reports" ADD CONSTRAINT "campus_map_reports_case_id_campus_map_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."campus_map_moderation_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_reports" ADD CONSTRAINT "campus_map_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campus_map_contributor_blocks_active_idx" ON "campus_map_contributor_blocks" USING btree ("contributor_id_snapshot","scope","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_moderation_cases_target_uq" ON "campus_map_moderation_cases" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_cases_queue_idx" ON "campus_map_moderation_cases" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_cases_target_kind_idx" ON "campus_map_moderation_cases" USING btree ("target_kind","updated_at");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_cases_signals_gin_idx" ON "campus_map_moderation_cases" USING gin ("signals");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_decisions_case_idx" ON "campus_map_moderation_decisions" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_decisions_target_idx" ON "campus_map_moderation_decisions" USING btree ("target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_decisions_actor_idx" ON "campus_map_moderation_decisions" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_rate_limits_updated_idx" ON "campus_map_moderation_rate_limits" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_moderation_requests_actor_key_uq" ON "campus_map_moderation_requests" USING btree ("actor_id_snapshot","idempotency_key");--> statement-breakpoint
CREATE INDEX "campus_map_moderation_requests_actor_idx" ON "campus_map_moderation_requests" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_reports_case_created_idx" ON "campus_map_reports" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_reports_reporter_idx" ON "campus_map_reports" USING btree ("reporter_user_id");
--> statement-breakpoint
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
