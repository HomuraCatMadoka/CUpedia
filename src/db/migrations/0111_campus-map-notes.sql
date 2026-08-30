CREATE TABLE "campus_map_note_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"actor_nickname_snapshot" text NOT NULL,
	"comment" text,
	"resolution_reason" text,
	"resolved_by_changeset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_note_events_revision_check" CHECK ("campus_map_note_events"."revision" > 0),
	CONSTRAINT "campus_map_note_events_kind_check" CHECK ("campus_map_note_events"."kind" in ('opening-comment', 'comment', 'resolve', 'reopen')),
	CONSTRAINT "campus_map_note_events_payload_check" CHECK ((
        "campus_map_note_events"."kind" in ('opening-comment', 'comment', 'reopen')
        and "campus_map_note_events"."comment" is not null
        and btrim("campus_map_note_events"."comment") <> ''
        and "campus_map_note_events"."resolution_reason" is null
        and "campus_map_note_events"."resolved_by_changeset_id" is null
      ) or (
        "campus_map_note_events"."kind" = 'resolve'
        and "campus_map_note_events"."resolution_reason" is not null
        and ("campus_map_note_events"."comment" is null or btrim("campus_map_note_events"."comment") <> '')
      )),
	CONSTRAINT "campus_map_note_events_resolution_reason_check" CHECK ("campus_map_note_events"."resolution_reason" is null or "campus_map_note_events"."resolution_reason" in ('fixed', 'not-an-issue', 'duplicate', 'insufficient-information', 'other'))
);
--> statement-breakpoint
CREATE TABLE "campus_map_note_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_note_outbox_status_check" CHECK ("campus_map_note_outbox"."status" in ('pending', 'processing', 'delivered', 'failed')),
	CONSTRAINT "campus_map_note_outbox_attempt_check" CHECK ("campus_map_note_outbox"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campus_map_note_rate_limits" (
	"scope" text NOT NULL,
	"subject_hash" text NOT NULL,
	"window_kind" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_note_rate_limits_scope_subject_hash_window_kind_pk" PRIMARY KEY("scope","subject_hash","window_kind"),
	CONSTRAINT "campus_map_note_rate_limits_scope_check" CHECK ("campus_map_note_rate_limits"."scope" in ('actor', 'ip')),
	CONSTRAINT "campus_map_note_rate_limits_window_check" CHECK ("campus_map_note_rate_limits"."window_kind" in ('burst', 'sustained')),
	CONSTRAINT "campus_map_note_rate_limits_hash_check" CHECK (char_length("campus_map_note_rate_limits"."subject_hash") = 64),
	CONSTRAINT "campus_map_note_rate_limits_attempt_check" CHECK ("campus_map_note_rate_limits"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campus_map_note_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"command_kind" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_note_requests_kind_check" CHECK ("campus_map_note_requests"."command_kind" in ('create', 'comment', 'resolve', 'reopen'))
);
--> statement-breakpoint
CREATE TABLE "campus_map_note_subscriptions" (
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_note_subscriptions_note_id_user_id_pk" PRIMARY KEY("note_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "campus_map_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid,
	"longitude" double precision,
	"latitude" double precision,
	"status" text DEFAULT 'open' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"author_user_id" uuid,
	"author_id_snapshot" uuid NOT NULL,
	"author_nickname_snapshot" text NOT NULL,
	"search_document" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_notes_context_check" CHECK ("campus_map_notes"."place_id" is not null or ("campus_map_notes"."longitude" is not null and "campus_map_notes"."latitude" is not null)),
	CONSTRAINT "campus_map_notes_position_check" CHECK (("campus_map_notes"."longitude" is null) = ("campus_map_notes"."latitude" is null)
        and (
          "campus_map_notes"."longitude" is null
          or ("campus_map_notes"."longitude" between -180 and 180 and "campus_map_notes"."latitude" between -90 and 90)
        )),
	CONSTRAINT "campus_map_notes_status_check" CHECK ("campus_map_notes"."status" in ('open', 'closed', 'moderator-hidden')),
	CONSTRAINT "campus_map_notes_revision_check" CHECK ("campus_map_notes"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "campus_map_note_events" ADD CONSTRAINT "campus_map_note_events_note_id_campus_map_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."campus_map_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_events" ADD CONSTRAINT "campus_map_note_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_events" ADD CONSTRAINT "campus_map_note_events_resolved_by_changeset_id_campus_map_changesets_id_fk" FOREIGN KEY ("resolved_by_changeset_id") REFERENCES "public"."campus_map_changesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_outbox" ADD CONSTRAINT "campus_map_note_outbox_note_id_campus_map_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."campus_map_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_outbox" ADD CONSTRAINT "campus_map_note_outbox_event_id_campus_map_note_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."campus_map_note_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_outbox" ADD CONSTRAINT "campus_map_note_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_requests" ADD CONSTRAINT "campus_map_note_requests_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_subscriptions" ADD CONSTRAINT "campus_map_note_subscriptions_note_id_campus_map_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."campus_map_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_note_subscriptions" ADD CONSTRAINT "campus_map_note_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_notes" ADD CONSTRAINT "campus_map_notes_place_id_campus_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_notes" ADD CONSTRAINT "campus_map_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_note_events_note_revision_uq" ON "campus_map_note_events" USING btree ("note_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_note_events_opening_uq" ON "campus_map_note_events" USING btree ("note_id") WHERE "campus_map_note_events"."kind" = 'opening-comment';--> statement-breakpoint
CREATE INDEX "campus_map_note_events_note_created_idx" ON "campus_map_note_events" USING btree ("note_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_note_events_actor_idx" ON "campus_map_note_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_note_events_changeset_idx" ON "campus_map_note_events" USING btree ("resolved_by_changeset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_note_outbox_event_recipient_uq" ON "campus_map_note_outbox" USING btree ("event_id","recipient_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_note_outbox_pending_idx" ON "campus_map_note_outbox" USING btree ("status","available_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_note_outbox_note_idx" ON "campus_map_note_outbox" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "campus_map_note_outbox_recipient_idx" ON "campus_map_note_outbox" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_note_rate_limits_updated_idx" ON "campus_map_note_rate_limits" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_note_requests_actor_key_uq" ON "campus_map_note_requests" USING btree ("actor_id_snapshot","idempotency_key");--> statement-breakpoint
CREATE INDEX "campus_map_note_requests_actor_user_idx" ON "campus_map_note_requests" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_note_subscriptions_user_idx" ON "campus_map_note_subscriptions" USING btree ("user_id","subscribed");--> statement-breakpoint
CREATE INDEX "campus_map_notes_place_updated_idx" ON "campus_map_notes" USING btree ("place_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_notes_status_updated_idx" ON "campus_map_notes" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_notes_author_updated_idx" ON "campus_map_notes" USING btree ("author_id_snapshot","updated_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_notes_author_user_idx" ON "campus_map_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_notes_search_idx" ON "campus_map_notes" USING gin (to_tsvector('simple', "search_document"));--> statement-breakpoint
CREATE INDEX "campus_map_notes_position_gist_idx" ON "campus_map_notes" USING gist (point("longitude", "latitude")) WHERE "campus_map_notes"."longitude" is not null and "campus_map_notes"."latitude" is not null;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('course_review_reply', 'announcement_published', 'campus_map_note_event'));
