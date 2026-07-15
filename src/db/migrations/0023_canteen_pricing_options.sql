CREATE TABLE "canteen_menu_item_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"label" text,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'HKD' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_menu_item_prices_amount_chk" CHECK ("canteen_menu_item_prices"."amount_minor" >= 0 AND "canteen_menu_item_prices"."amount_minor" <= 999900),
	CONSTRAINT "canteen_menu_item_prices_currency_chk" CHECK ("canteen_menu_item_prices"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_item_prices" ADD CONSTRAINT "canteen_menu_item_prices_menu_item_id_canteen_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."canteen_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_menu_item_prices_item_sort_idx" ON "canteen_menu_item_prices" USING btree ("menu_item_id","sort_order");