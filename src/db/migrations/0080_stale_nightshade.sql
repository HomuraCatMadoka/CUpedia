CREATE TABLE "campus_map_provider_mapping_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_object_id" text NOT NULL,
	"command_kind" text NOT NULL,
	"previous_target_kind" text,
	"previous_building_id" uuid,
	"previous_place_id" uuid,
	"new_target_kind" text,
	"new_building_id" uuid,
	"new_place_id" uuid,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"actor_nickname_snapshot" text NOT NULL,
	"reason" text NOT NULL,
	"provenance_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_provider_mapping_events_command_kind_check" CHECK ("campus_map_provider_mapping_events"."command_kind" in ('bind', 'unlink', 'rebind')),
	CONSTRAINT "campus_map_provider_mapping_events_reason_check" CHECK (btrim("campus_map_provider_mapping_events"."reason") <> ''),
	CONSTRAINT "campus_map_provider_mapping_events_previous_target_check" CHECK ((
        "campus_map_provider_mapping_events"."previous_target_kind" is null
        and "campus_map_provider_mapping_events"."previous_building_id" is null
        and "campus_map_provider_mapping_events"."previous_place_id" is null
      ) or (
        "campus_map_provider_mapping_events"."previous_target_kind" = 'building'
        and "campus_map_provider_mapping_events"."previous_building_id" is not null
        and "campus_map_provider_mapping_events"."previous_place_id" is null
      ) or (
        "campus_map_provider_mapping_events"."previous_target_kind" = 'place'
        and "campus_map_provider_mapping_events"."previous_building_id" is null
        and "campus_map_provider_mapping_events"."previous_place_id" is not null
      )),
	CONSTRAINT "campus_map_provider_mapping_events_new_target_check" CHECK ((
        "campus_map_provider_mapping_events"."new_target_kind" is null
        and "campus_map_provider_mapping_events"."new_building_id" is null
        and "campus_map_provider_mapping_events"."new_place_id" is null
      ) or (
        "campus_map_provider_mapping_events"."new_target_kind" = 'building'
        and "campus_map_provider_mapping_events"."new_building_id" is not null
        and "campus_map_provider_mapping_events"."new_place_id" is null
      ) or (
        "campus_map_provider_mapping_events"."new_target_kind" = 'place'
        and "campus_map_provider_mapping_events"."new_building_id" is null
        and "campus_map_provider_mapping_events"."new_place_id" is not null
      )),
	CONSTRAINT "campus_map_provider_mapping_events_lifecycle_check" CHECK ((
        "campus_map_provider_mapping_events"."command_kind" = 'bind'
        and "campus_map_provider_mapping_events"."previous_target_kind" is null
        and "campus_map_provider_mapping_events"."new_target_kind" is not null
      ) or (
        "campus_map_provider_mapping_events"."command_kind" = 'unlink'
        and "campus_map_provider_mapping_events"."previous_target_kind" is not null
        and "campus_map_provider_mapping_events"."new_target_kind" is null
      ) or (
        "campus_map_provider_mapping_events"."command_kind" = 'rebind'
        and "campus_map_provider_mapping_events"."previous_target_kind" is not null
        and "campus_map_provider_mapping_events"."new_target_kind" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_provider_mapping_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campus_map_provider_mapping_events" ADD CONSTRAINT "campus_map_provider_mapping_events_previous_building_id_campus_map_buildings_id_fk" FOREIGN KEY ("previous_building_id") REFERENCES "public"."campus_map_buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mapping_events" ADD CONSTRAINT "campus_map_provider_mapping_events_previous_place_id_campus_map_places_id_fk" FOREIGN KEY ("previous_place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mapping_events" ADD CONSTRAINT "campus_map_provider_mapping_events_new_building_id_campus_map_buildings_id_fk" FOREIGN KEY ("new_building_id") REFERENCES "public"."campus_map_buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mapping_events" ADD CONSTRAINT "campus_map_provider_mapping_events_new_place_id_campus_map_places_id_fk" FOREIGN KEY ("new_place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mapping_events" ADD CONSTRAINT "campus_map_provider_mapping_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mapping_events" ADD CONSTRAINT "campus_map_provider_mapping_events_provenance_id_campus_map_provenance_sources_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."campus_map_provenance_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mapping_requests" ADD CONSTRAINT "campus_map_provider_mapping_requests_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_events_identity_idx" ON "campus_map_provider_mapping_events" USING btree ("provider","provider_object_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_events_actor_idx" ON "campus_map_provider_mapping_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_events_provenance_idx" ON "campus_map_provider_mapping_events" USING btree ("provenance_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_events_previous_building_idx" ON "campus_map_provider_mapping_events" USING btree ("previous_building_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_events_previous_place_idx" ON "campus_map_provider_mapping_events" USING btree ("previous_place_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_events_new_building_idx" ON "campus_map_provider_mapping_events" USING btree ("new_building_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_events_new_place_idx" ON "campus_map_provider_mapping_events" USING btree ("new_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_provider_mapping_requests_actor_key_uq" ON "campus_map_provider_mapping_requests" USING btree ("actor_id_snapshot","idempotency_key");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mapping_requests_actor_idx" ON "campus_map_provider_mapping_requests" USING btree ("actor_user_id");
