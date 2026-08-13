-- Generated DDL plus reviewed in-place identity expansion/backfill. The custom
-- SQL portion follows ADR 0014 and intentionally updates existing rows rather
-- than replacing UUIDs that own votes and comments.
ALTER TABLE "canteen_menu_items" ADD COLUMN "menu_source_id" uuid;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD COLUMN "external_product_id" text;--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD COLUMN "last_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD COLUMN "legacy_takeover_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" DROP CONSTRAINT IF EXISTS "canteen_menu_sources_qmai_disabled_chk";--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD COLUMN "external_owner_id" text;--> statement-breakpoint
UPDATE "canteen_menu_sources"
SET
  "external_owner_id" = "config"->>'sellerId',
  "config" = "config" - 'sellerId',
  "updated_at" = now()
WHERE "provider" = 'qmai'
  AND nullif(btrim("config"->>'sellerId'), '') IS NOT NULL;--> statement-breakpoint
DROP INDEX "canteen_menu_sources_provider_store_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_menu_sources_provider_owner_store_uidx" ON "canteen_menu_sources" USING btree ("provider",coalesce("external_owner_id", ''),"external_store_id");--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD CONSTRAINT "canteen_menu_sources_locator_chk" CHECK (("canteen_menu_sources"."provider" = 'qmai' and "canteen_menu_sources"."external_owner_id" is not null and length(trim("canteen_menu_sources"."external_owner_id")) between 1 and 200) or ("canteen_menu_sources"."provider" <> 'qmai' and "canteen_menu_sources"."external_owner_id" is null));--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD CONSTRAINT "canteen_menu_sources_id_canteen_uq" UNIQUE("id","canteen_id");--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD CONSTRAINT "canteen_menu_items_source_canteen_fk" FOREIGN KEY ("menu_source_id","canteen_id") REFERENCES "public"."canteen_menu_sources"("id","canteen_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_menu_items_menu_source_id_idx" ON "canteen_menu_items" USING btree ("menu_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_menu_items_source_product_uidx" ON "canteen_menu_items" USING btree ("menu_source_id","external_product_id") WHERE "canteen_menu_items"."menu_source_id" is not null and "canteen_menu_items"."external_product_id" is not null;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD CONSTRAINT "canteen_menu_items_source_product_identity_chk" CHECK (("canteen_menu_items"."menu_source_id" is null) = ("canteen_menu_items"."external_product_id" is null));--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD CONSTRAINT "canteen_menu_items_external_product_id_chk" CHECK ("canteen_menu_items"."external_product_id" is null or length(trim("canteen_menu_items"."external_product_id")) between 1 and 200);
