ALTER TABLE "campus_bus_prediction_model_revisions" ADD COLUMN "run_kind" text DEFAULT 'automated' NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_bus_prediction_model_revisions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "campus_bus_prediction_model_revisions" ADD COLUMN "parameters" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_bus_prediction_model_revisions" ADD COLUMN "route_scope" text;--> statement-breakpoint
ALTER TABLE "campus_bus_prediction_model_revisions" ADD CONSTRAINT "campus_bus_prediction_model_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campus_bus_arrival_observations_arrival_at_idx" ON "campus_bus_arrival_observations" USING btree ("observed_arrival_at");--> statement-breakpoint
CREATE INDEX "campus_bus_arrival_observations_route_time_idx" ON "campus_bus_arrival_observations" USING btree ("route_id","observed_arrival_at");--> statement-breakpoint
CREATE INDEX "campus_bus_prediction_revisions_parent_idx" ON "campus_bus_prediction_model_revisions" USING btree ("parent_revision_id");--> statement-breakpoint
CREATE INDEX "campus_bus_prediction_revisions_creator_idx" ON "campus_bus_prediction_model_revisions" USING btree ("created_by","created_at") WHERE "campus_bus_prediction_model_revisions"."created_by" is not null;--> statement-breakpoint
CREATE INDEX "campus_bus_prediction_revisions_kind_created_idx" ON "campus_bus_prediction_model_revisions" USING btree ("run_kind","created_at");--> statement-breakpoint
ALTER TABLE "campus_bus_prediction_model_revisions" ADD CONSTRAINT "campus_bus_prediction_revisions_run_kind_chk" CHECK ("campus_bus_prediction_model_revisions"."run_kind" in ('automated', 'experiment'));