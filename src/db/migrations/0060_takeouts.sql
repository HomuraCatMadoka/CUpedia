CREATE TABLE "takeout_menu_item_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"label" text,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'HKD' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "takeout_menu_item_prices_amount_chk" CHECK ("takeout_menu_item_prices"."amount_minor" >= 0 AND "takeout_menu_item_prices"."amount_minor" <= 999900),
	CONSTRAINT "takeout_menu_item_prices_currency_chk" CHECK ("takeout_menu_item_prices"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "takeout_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"takeout_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer,
	"meal_periods" text[] DEFAULT '{allday}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"svg_key" text DEFAULT 'default' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takeouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"announcement" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "takeout_menu_item_prices" ADD CONSTRAINT "takeout_menu_item_prices_menu_item_id_takeout_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."takeout_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeout_menu_items" ADD CONSTRAINT "takeout_menu_items_takeout_id_takeouts_id_fk" FOREIGN KEY ("takeout_id") REFERENCES "public"."takeouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "takeout_menu_item_prices_item_sort_idx" ON "takeout_menu_item_prices" USING btree ("menu_item_id","sort_order");--> statement-breakpoint
CREATE INDEX "takeout_menu_items_takeout_id_idx" ON "takeout_menu_items" USING btree ("takeout_id");