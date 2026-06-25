CREATE TABLE "canteen_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer,
	"meal_period" text DEFAULT 'lunch' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"svg_key" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD CONSTRAINT "canteen_menu_items_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_menu_items_canteen_id_idx" ON "canteen_menu_items" USING btree ("canteen_id");--> statement-breakpoint
CREATE INDEX "canteen_menu_items_canteen_meal_idx" ON "canteen_menu_items" USING btree ("canteen_id","meal_period");