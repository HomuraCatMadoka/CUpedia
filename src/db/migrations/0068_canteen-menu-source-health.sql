ALTER TABLE "canteen_menu_sources" ADD COLUMN "allow_legacy_takeover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD COLUMN "observed_state" text;--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD COLUMN "last_error_code" text;