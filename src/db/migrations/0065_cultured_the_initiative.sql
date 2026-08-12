CREATE TABLE "campus_bus_arrival_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" text NOT NULL,
	"stop_id" text NOT NULL,
	"stop_occurrence_id" text NOT NULL,
	"observed_arrival_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model_revision_id" text NOT NULL,
	"projection_id" text,
	"candidate_pattern_id" text,
	"candidate_departure_at" timestamp with time zone,
	"submitted_anonymously" boolean DEFAULT true NOT NULL,
	CONSTRAINT "campus_bus_arrival_observations_time_window_chk" CHECK ("campus_bus_arrival_observations"."observed_arrival_at" >= "campus_bus_arrival_observations"."received_at" - interval '15 minutes'
        AND "campus_bus_arrival_observations"."observed_arrival_at" <= "campus_bus_arrival_observations"."received_at" + interval '2 minutes')
);
--> statement-breakpoint
CREATE INDEX "campus_bus_arrival_observations_route_stop_time_idx" ON "campus_bus_arrival_observations" USING btree ("route_id","stop_id","observed_arrival_at");--> statement-breakpoint
CREATE INDEX "campus_bus_arrival_observations_received_at_idx" ON "campus_bus_arrival_observations" USING btree ("received_at");