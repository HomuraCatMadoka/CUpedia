CREATE TABLE "campus_bus_feedback_rate_limits" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "campus_bus_feedback_rate_limits_submission_count_chk" CHECK ("campus_bus_feedback_rate_limits"."submission_count" >= 0)
);
--> statement-breakpoint
DROP INDEX "campus_bus_arrival_observations_rate_limit_idx";--> statement-breakpoint
CREATE INDEX "campus_bus_feedback_rate_limits_expires_at_idx" ON "campus_bus_feedback_rate_limits" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "campus_bus_arrival_observations" DROP COLUMN "rate_limit_key_hash";