CREATE TABLE "campus_bus_arrival_event_observations" (
	"event_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	CONSTRAINT "campus_bus_arrival_event_observations_event_id_observation_id_pk" PRIMARY KEY("event_id","observation_id")
);
--> statement-breakpoint
CREATE TABLE "campus_bus_arrival_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_revision_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"route_id" text NOT NULL,
	"pattern_id" text NOT NULL,
	"stop_occurrence_id" text NOT NULL,
	"scheduled_departure_at" timestamp with time zone NOT NULL,
	"baseline_arrival_at" timestamp with time zone NOT NULL,
	"observed_arrival_at" timestamp with time zone NOT NULL,
	"service_date" date NOT NULL,
	"residual_seconds" integer NOT NULL,
	"observation_count" integer NOT NULL,
	"confidence" real NOT NULL,
	CONSTRAINT "campus_bus_arrival_events_observation_count_chk" CHECK ("campus_bus_arrival_events"."observation_count" > 0),
	CONSTRAINT "campus_bus_arrival_events_confidence_chk" CHECK ("campus_bus_arrival_events"."confidence" > 0 AND "campus_bus_arrival_events"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "campus_bus_prediction_adjustments" (
	"model_revision_id" uuid NOT NULL,
	"route_id" text NOT NULL,
	"pattern_id" text NOT NULL,
	"stop_occurrence_id" text NOT NULL,
	"time_band" text NOT NULL,
	"residual_seconds" integer NOT NULL,
	"event_count" integer NOT NULL,
	"service_day_count" integer NOT NULL,
	"median_residual_seconds" integer NOT NULL,
	"median_absolute_deviation_seconds" integer NOT NULL,
	"shrinkage_weight" real NOT NULL,
	CONSTRAINT "campus_bus_prediction_adjustments_model_revision_id_route_id_pattern_id_stop_occurrence_id_time_band_pk" PRIMARY KEY("model_revision_id","route_id","pattern_id","stop_occurrence_id","time_band"),
	CONSTRAINT "campus_bus_prediction_adjustments_band_chk" CHECK ("campus_bus_prediction_adjustments"."time_band" in ('morning_peak', 'midday', 'evening_peak', 'night', 'all_day')),
	CONSTRAINT "campus_bus_prediction_adjustments_counts_chk" CHECK ("campus_bus_prediction_adjustments"."event_count" > 0 AND "campus_bus_prediction_adjustments"."service_day_count" > 0),
	CONSTRAINT "campus_bus_prediction_adjustments_weight_chk" CHECK ("campus_bus_prediction_adjustments"."shrinkage_weight" > 0 AND "campus_bus_prediction_adjustments"."shrinkage_weight" < 1)
);
--> statement-breakpoint
CREATE TABLE "campus_bus_prediction_model_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"algorithm" text NOT NULL,
	"status" text NOT NULL,
	"parent_revision_id" uuid,
	"observation_cutoff_at" timestamp with time zone NOT NULL,
	"training_window_start" timestamp with time zone NOT NULL,
	"training_window_end" timestamp with time zone NOT NULL,
	"training_event_count" integer NOT NULL,
	"training_service_day_count" integer NOT NULL,
	"validation_event_count" integer NOT NULL,
	"source_observation_count" integer NOT NULL,
	"snapshot_hash" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone,
	CONSTRAINT "campus_bus_prediction_revisions_status_chk" CHECK ("campus_bus_prediction_model_revisions"."status" in ('candidate', 'champion', 'retired', 'insufficient')),
	CONSTRAINT "campus_bus_prediction_revisions_counts_chk" CHECK ("campus_bus_prediction_model_revisions"."training_event_count" >= 0
        AND "campus_bus_prediction_model_revisions"."training_service_day_count" >= 0
        AND "campus_bus_prediction_model_revisions"."validation_event_count" >= 0
        AND "campus_bus_prediction_model_revisions"."source_observation_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campus_bus_trip_match_candidates" (
	"model_revision_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"pattern_id" text NOT NULL,
	"scheduled_departure_at" timestamp with time zone NOT NULL,
	"baseline_arrival_at" timestamp with time zone NOT NULL,
	"probability" real NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "campus_bus_trip_match_candidates_model_revision_id_observation_id_pattern_id_scheduled_departure_at_pk" PRIMARY KEY("model_revision_id","observation_id","pattern_id","scheduled_departure_at"),
	CONSTRAINT "campus_bus_trip_candidates_probability_chk" CHECK ("campus_bus_trip_match_candidates"."probability" > 0 AND "campus_bus_trip_match_candidates"."probability" <= 1),
	CONSTRAINT "campus_bus_trip_candidates_rank_chk" CHECK ("campus_bus_trip_match_candidates"."rank" > 0)
);
--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_observations" ADD COLUMN "rate_limit_key_hash" text;--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_event_observations" ADD CONSTRAINT "campus_bus_arrival_event_observations_event_id_campus_bus_arrival_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."campus_bus_arrival_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_event_observations" ADD CONSTRAINT "campus_bus_arrival_event_observations_observation_id_campus_bus_arrival_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."campus_bus_arrival_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_events" ADD CONSTRAINT "campus_bus_arrival_events_model_revision_id_campus_bus_prediction_model_revisions_id_fk" FOREIGN KEY ("model_revision_id") REFERENCES "public"."campus_bus_prediction_model_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_bus_prediction_adjustments" ADD CONSTRAINT "campus_bus_prediction_adjustments_model_revision_id_campus_bus_prediction_model_revisions_id_fk" FOREIGN KEY ("model_revision_id") REFERENCES "public"."campus_bus_prediction_model_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_bus_prediction_model_revisions" ADD CONSTRAINT "campus_bus_prediction_model_revisions_parent_revision_id_campus_bus_prediction_model_revisions_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."campus_bus_prediction_model_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_bus_trip_match_candidates" ADD CONSTRAINT "campus_bus_trip_match_candidates_model_revision_id_campus_bus_prediction_model_revisions_id_fk" FOREIGN KEY ("model_revision_id") REFERENCES "public"."campus_bus_prediction_model_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_bus_trip_match_candidates" ADD CONSTRAINT "campus_bus_trip_match_candidates_observation_id_campus_bus_arrival_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."campus_bus_arrival_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campus_bus_event_observations_observation_idx" ON "campus_bus_arrival_event_observations" USING btree ("observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_bus_arrival_events_revision_key_uq" ON "campus_bus_arrival_events" USING btree ("model_revision_id","event_key");--> statement-breakpoint
CREATE INDEX "campus_bus_arrival_events_training_idx" ON "campus_bus_arrival_events" USING btree ("model_revision_id","route_id","pattern_id","stop_occurrence_id","service_date");--> statement-breakpoint
CREATE INDEX "campus_bus_prediction_adjustments_lookup_idx" ON "campus_bus_prediction_adjustments" USING btree ("model_revision_id","route_id");--> statement-breakpoint
CREATE INDEX "campus_bus_prediction_revisions_status_idx" ON "campus_bus_prediction_model_revisions" USING btree ("status","promoted_at");--> statement-breakpoint
CREATE INDEX "campus_bus_trip_candidates_observation_idx" ON "campus_bus_trip_match_candidates" USING btree ("observation_id","model_revision_id");--> statement-breakpoint
CREATE INDEX "campus_bus_arrival_observations_rate_limit_idx" ON "campus_bus_arrival_observations" USING btree ("rate_limit_key_hash","received_at") WHERE "campus_bus_arrival_observations"."rate_limit_key_hash" is not null;