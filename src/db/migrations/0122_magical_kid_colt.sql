ALTER TABLE "campus_bus_arrival_events" ADD COLUMN "route_revision_id" text;--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_events" ADD COLUMN "pattern_revision_id" text;--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_observations" ADD COLUMN "candidate_pattern_revision_id" text;--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_observations" ADD COLUMN "candidate_scheduled_departure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_observations" ADD COLUMN "prediction_model_revision_id" text;--> statement-breakpoint
ALTER TABLE "campus_bus_trip_match_candidates" ADD COLUMN "route_revision_id" text;--> statement-breakpoint
ALTER TABLE "campus_bus_trip_match_candidates" ADD COLUMN "pattern_revision_id" text;