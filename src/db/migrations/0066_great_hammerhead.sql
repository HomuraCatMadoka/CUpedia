CREATE TABLE "canteen_menu_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_store_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_snapshot_hash" text,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_menu_sources_provider_chk" CHECK ("canteen_menu_sources"."provider" in ('aigens', 'ichef')),
	CONSTRAINT "canteen_menu_sources_store_id_chk" CHECK (length(trim("canteen_menu_sources"."external_store_id")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD CONSTRAINT "canteen_menu_sources_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_menu_sources_canteen_uidx" ON "canteen_menu_sources" USING btree ("canteen_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_menu_sources_provider_store_uidx" ON "canteen_menu_sources" USING btree ("provider","external_store_id");--> statement-breakpoint
CREATE INDEX "canteen_menu_sources_enabled_idx" ON "canteen_menu_sources" USING btree ("enabled");