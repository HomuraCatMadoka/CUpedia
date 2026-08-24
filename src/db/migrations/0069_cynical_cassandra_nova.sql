CREATE TABLE "campus_map_publish_rate_limits" (
	"scope" text NOT NULL,
	"subject_hash" text NOT NULL,
	"window_kind" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_publish_rate_limits_scope_subject_hash_window_kind_pk" PRIMARY KEY("scope","subject_hash","window_kind"),
	CONSTRAINT "campus_map_publish_rate_limits_scope_check" CHECK ("campus_map_publish_rate_limits"."scope" in ('actor', 'ip')),
	CONSTRAINT "campus_map_publish_rate_limits_window_check" CHECK ("campus_map_publish_rate_limits"."window_kind" in ('burst', 'sustained')),
	CONSTRAINT "campus_map_publish_rate_limits_subject_hash_check" CHECK (char_length("campus_map_publish_rate_limits"."subject_hash") = 64),
	CONSTRAINT "campus_map_publish_rate_limits_attempt_count_check" CHECK ("campus_map_publish_rate_limits"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "campus_map_publish_rate_limits_updated_idx" ON "campus_map_publish_rate_limits" USING btree ("updated_at");