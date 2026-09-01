CREATE TABLE "campus_map_place_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"content" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_place_feedback_rating_check" CHECK ("campus_map_place_feedback"."rating" between 1 and 5),
	CONSTRAINT "campus_map_place_feedback_content_check" CHECK ("campus_map_place_feedback"."content" is null or (
        btrim("campus_map_place_feedback"."content") <> ''
        and char_length("campus_map_place_feedback"."content") <= 2000
        and octet_length("campus_map_place_feedback"."content") <= 8192
      )),
	CONSTRAINT "campus_map_place_feedback_version_check" CHECK ("campus_map_place_feedback"."version" > 0),
	CONSTRAINT "campus_map_place_feedback_timestamps_check" CHECK ("campus_map_place_feedback"."updated_at" >= "campus_map_place_feedback"."created_at")
);
--> statement-breakpoint
ALTER TABLE "campus_map_place_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campus_map_place_feedback_visibility" (
	"feedback_id" uuid PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"decision_ref" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_place_feedback_visibility_check" CHECK (("campus_map_place_feedback_visibility"."visibility" = 'public' and "campus_map_place_feedback_visibility"."decision_ref" is null)
        or ("campus_map_place_feedback_visibility"."visibility" = 'hidden' and "campus_map_place_feedback_visibility"."decision_ref" is not null))
);
--> statement-breakpoint
ALTER TABLE "campus_map_place_feedback_visibility" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campus_map_moderation_cases" DROP CONSTRAINT "campus_map_moderation_cases_target_kind_check";--> statement-breakpoint
ALTER TABLE "campus_map_moderation_decisions" DROP CONSTRAINT "campus_map_moderation_decisions_kind_check";--> statement-breakpoint
ALTER TABLE "campus_map_moderation_decisions" DROP CONSTRAINT "campus_map_moderation_decisions_target_kind_check";--> statement-breakpoint
ALTER TABLE "campus_map_place_feedback" ADD CONSTRAINT "campus_map_place_feedback_place_id_campus_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_place_feedback" ADD CONSTRAINT "campus_map_place_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_place_feedback_visibility" ADD CONSTRAINT "campus_map_place_feedback_visibility_feedback_id_campus_map_place_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."campus_map_place_feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_place_feedback_place_user_uq" ON "campus_map_place_feedback" USING btree ("place_id","user_id");--> statement-breakpoint
CREATE INDEX "campus_map_place_feedback_user_idx" ON "campus_map_place_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "campus_map_place_feedback_place_created_idx" ON "campus_map_place_feedback" USING btree ("place_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "campus_map_moderation_cases" ADD CONSTRAINT "campus_map_moderation_cases_target_kind_check" CHECK ("campus_map_moderation_cases"."target_kind" in ('changeset', 'revision', 'map-note', 'map-note-event', 'place-feedback', 'actor'));--> statement-breakpoint
ALTER TABLE "campus_map_moderation_decisions" ADD CONSTRAINT "campus_map_moderation_decisions_kind_check" CHECK ("campus_map_moderation_decisions"."command_kind" in ('decide-case', 'hide-map-note', 'unhide-map-note', 'hide-map-note-event', 'unhide-map-note-event', 'hide-place-feedback', 'unhide-place-feedback', 'redact-revision', 'revoke-revision-redaction', 'block-contributor', 'revoke-contributor-block'));--> statement-breakpoint
ALTER TABLE "campus_map_moderation_decisions" ADD CONSTRAINT "campus_map_moderation_decisions_target_kind_check" CHECK ("campus_map_moderation_decisions"."target_kind" in ('changeset', 'revision', 'map-note', 'map-note-event', 'place-feedback', 'actor'));