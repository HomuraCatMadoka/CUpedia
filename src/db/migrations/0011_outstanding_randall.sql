CREATE TABLE "menu_import_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"source_image_url" text NOT NULL,
	"ocr_raw_text" text,
	"items" jsonb NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_import_drafts" ADD CONSTRAINT "menu_import_drafts_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_import_drafts_canteen_id_idx" ON "menu_import_drafts" USING btree ("canteen_id");