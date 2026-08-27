CREATE TABLE "canteen_menu_identity_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"menu_source_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_menu_item_id" uuid NOT NULL,
	"to_menu_item_id" uuid NOT NULL,
	"from_normalized_name" text NOT NULL,
	"to_normalized_name" text NOT NULL,
	"external_product_ids" text[] NOT NULL,
	"event_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_menu_identity_transitions_kind_chk" CHECK ("canteen_menu_identity_transitions"."kind" in ('rename', 'split', 'merge')),
	CONSTRAINT "canteen_menu_identity_transitions_shape_chk" CHECK (("canteen_menu_identity_transitions"."kind" = 'rename' and "canteen_menu_identity_transitions"."from_menu_item_id" = "canteen_menu_identity_transitions"."to_menu_item_id" and "canteen_menu_identity_transitions"."from_normalized_name" <> "canteen_menu_identity_transitions"."to_normalized_name") or ("canteen_menu_identity_transitions"."kind" in ('split', 'merge') and "canteen_menu_identity_transitions"."from_menu_item_id" <> "canteen_menu_identity_transitions"."to_menu_item_id")),
	CONSTRAINT "canteen_menu_identity_transitions_names_chk" CHECK (length(trim("canteen_menu_identity_transitions"."from_normalized_name")) between 1 and 200 and length(trim("canteen_menu_identity_transitions"."to_normalized_name")) between 1 and 200),
	CONSTRAINT "canteen_menu_identity_transitions_products_chk" CHECK (cardinality("canteen_menu_identity_transitions"."external_product_ids") > 0),
	CONSTRAINT "canteen_menu_identity_transitions_event_key_chk" CHECK ("canteen_menu_identity_transitions"."event_key" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_identity_transitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canteen_menu_identity_transitions" ADD CONSTRAINT "canteen_menu_identity_transitions_source_canteen_fk" FOREIGN KEY ("menu_source_id","canteen_id") REFERENCES "public"."canteen_menu_sources"("id","canteen_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_menu_identity_transitions" ADD CONSTRAINT "canteen_menu_identity_transitions_from_canteen_fk" FOREIGN KEY ("from_menu_item_id","canteen_id") REFERENCES "public"."canteen_menu_items"("id","canteen_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_menu_identity_transitions" ADD CONSTRAINT "canteen_menu_identity_transitions_to_canteen_fk" FOREIGN KEY ("to_menu_item_id","canteen_id") REFERENCES "public"."canteen_menu_items"("id","canteen_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_menu_identity_transitions_event_uidx" ON "canteen_menu_identity_transitions" USING btree ("menu_source_id","event_key");--> statement-breakpoint
CREATE INDEX "canteen_menu_identity_transitions_from_idx" ON "canteen_menu_identity_transitions" USING btree ("from_menu_item_id","created_at");--> statement-breakpoint
CREATE INDEX "canteen_menu_identity_transitions_to_idx" ON "canteen_menu_identity_transitions" USING btree ("to_menu_item_id","created_at");
