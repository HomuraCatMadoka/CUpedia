CREATE TABLE "canteen_menu_offering_occurrences" (
	"offering_id" uuid NOT NULL,
	"meal_period" text NOT NULL,
	"category_key" text NOT NULL,
	"sort_order" integer NOT NULL,
	"price_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_menu_offering_occurrences_offering_id_meal_period_category_key_pk" PRIMARY KEY("offering_id","meal_period","category_key"),
	CONSTRAINT "canteen_menu_offering_occurrences_period_chk" CHECK ("canteen_menu_offering_occurrences"."meal_period" in ('breakfast', 'lunch', 'dinner', 'allday')),
	CONSTRAINT "canteen_menu_offering_occurrences_category_chk" CHECK (length(trim("canteen_menu_offering_occurrences"."category_key")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_offering_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "canteen_menu_provider_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"menu_source_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	"provider_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_menu_provider_offerings_source_product_uq" UNIQUE("menu_source_id","external_product_id"),
	CONSTRAINT "canteen_menu_provider_offerings_external_id_chk" CHECK (length(trim("canteen_menu_provider_offerings"."external_product_id")) between 1 and 200),
	CONSTRAINT "canteen_menu_provider_offerings_name_chk" CHECK (length(trim("canteen_menu_provider_offerings"."provider_name")) between 1 and 200 and length(trim("canteen_menu_provider_offerings"."normalized_name")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_provider_offerings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_snapshot_items" ADD COLUMN "occurrences" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD CONSTRAINT "canteen_menu_items_id_canteen_uq" UNIQUE("id","canteen_id");--> statement-breakpoint
ALTER TABLE "canteen_menu_offering_occurrences" ADD CONSTRAINT "canteen_menu_offering_occurrences_offering_id_canteen_menu_provider_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."canteen_menu_provider_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_menu_provider_offerings" ADD CONSTRAINT "canteen_menu_provider_offerings_source_canteen_fk" FOREIGN KEY ("menu_source_id","canteen_id") REFERENCES "public"."canteen_menu_sources"("id","canteen_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_menu_provider_offerings" ADD CONSTRAINT "canteen_menu_provider_offerings_item_canteen_fk" FOREIGN KEY ("menu_item_id","canteen_id") REFERENCES "public"."canteen_menu_items"("id","canteen_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_menu_offering_occurrences_period_idx" ON "canteen_menu_offering_occurrences" USING btree ("meal_period","offering_id");--> statement-breakpoint
CREATE INDEX "canteen_menu_provider_offerings_item_idx" ON "canteen_menu_provider_offerings" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "canteen_menu_provider_offerings_source_name_idx" ON "canteen_menu_provider_offerings" USING btree ("menu_source_id","normalized_name");
