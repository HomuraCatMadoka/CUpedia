ALTER TABLE "canteen_menu_items" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD COLUMN "is_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_menu_items_external_identity_uidx" ON "canteen_menu_items" USING btree ("canteen_id","external_source","external_key") WHERE "canteen_menu_items"."external_source" is not null and "canteen_menu_items"."external_key" is not null;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD CONSTRAINT "canteen_menu_items_external_identity_chk" CHECK (("canteen_menu_items"."external_source" is null) = ("canteen_menu_items"."external_key" is null));