CREATE TABLE "canteen_ordering_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_ordering_handoffs_provider_chk" CHECK ("canteen_ordering_handoffs"."provider" in ('aigens', 'ichef', 'pinme', 'qmai', 'external')),
	CONSTRAINT "canteen_ordering_handoffs_url_chk" CHECK (length(trim("canteen_ordering_handoffs"."url")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" DROP CONSTRAINT "canteen_menu_sources_provider_chk";--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "canteen_ordering_handoffs" ADD CONSTRAINT "canteen_ordering_handoffs_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_ordering_handoffs_canteen_uidx" ON "canteen_ordering_handoffs" USING btree ("canteen_id");--> statement-breakpoint
ALTER TABLE "canteen_menu_sources" ADD CONSTRAINT "canteen_menu_sources_provider_chk" CHECK ("canteen_menu_sources"."provider" in ('aigens', 'ichef', 'pinme', 'qmai'));