CREATE TABLE "canteen_menu_sync_snapshot_items" (
	"run_id" uuid NOT NULL,
	"external_product_id" text NOT NULL,
	"name" text NOT NULL,
	"price_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meal_periods" text[] NOT NULL,
	"sort_order" integer NOT NULL,
	"svg_key" text NOT NULL,
	CONSTRAINT "canteen_menu_sync_snapshot_items_run_id_external_product_id_pk" PRIMARY KEY("run_id","external_product_id"),
	CONSTRAINT "canteen_menu_sync_snapshot_items_external_id_chk" CHECK (length(trim("canteen_menu_sync_snapshot_items"."external_product_id")) between 1 and 200),
	CONSTRAINT "canteen_menu_sync_snapshot_items_name_chk" CHECK (length(trim("canteen_menu_sync_snapshot_items"."name")) between 1 and 200),
	CONSTRAINT "canteen_menu_sync_snapshot_items_svg_key_chk" CHECK (length(trim("canteen_menu_sync_snapshot_items"."svg_key")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_snapshot_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "canteen_menu_sync_snapshots" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"menu_source_id" uuid NOT NULL,
	"snapshot_hash" text NOT NULL,
	"snapshot_completeness" text NOT NULL,
	"item_count" integer NOT NULL,
	"sync_window_key" text NOT NULL,
	"meal_period" text NOT NULL,
	"hkt_weekday" integer NOT NULL,
	"observed_minute_of_day" integer NOT NULL,
	"scope_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "canteen_menu_sync_snapshots_hash_chk" CHECK (length("canteen_menu_sync_snapshots"."snapshot_hash") = 64),
	CONSTRAINT "canteen_menu_sync_snapshots_completeness_chk" CHECK ("canteen_menu_sync_snapshots"."snapshot_completeness" in ('complete', 'partial')),
	CONSTRAINT "canteen_menu_sync_snapshots_item_count_chk" CHECK ("canteen_menu_sync_snapshots"."item_count" >= 0),
	CONSTRAINT "canteen_menu_sync_snapshots_meal_period_chk" CHECK ("canteen_menu_sync_snapshots"."meal_period" in ('breakfast', 'lunch', 'dinner')),
	CONSTRAINT "canteen_menu_sync_snapshots_hkt_weekday_chk" CHECK ("canteen_menu_sync_snapshots"."hkt_weekday" between 0 and 6),
	CONSTRAINT "canteen_menu_sync_snapshots_minute_chk" CHECK ("canteen_menu_sync_snapshots"."observed_minute_of_day" between 0 and 1439)
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_snapshot_items" ADD CONSTRAINT "canteen_menu_sync_snapshot_items_run_id_canteen_menu_sync_snapshots_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."canteen_menu_sync_snapshots"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_snapshots" ADD CONSTRAINT "canteen_menu_sync_snapshots_run_id_canteen_menu_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."canteen_menu_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_snapshots" ADD CONSTRAINT "canteen_menu_sync_snapshots_menu_source_id_canteen_menu_sources_id_fk" FOREIGN KEY ("menu_source_id") REFERENCES "public"."canteen_menu_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_menu_sync_snapshot_items_product_idx" ON "canteen_menu_sync_snapshot_items" USING btree ("external_product_id","run_id");--> statement-breakpoint
CREATE INDEX "canteen_menu_sync_snapshots_source_observed_idx" ON "canteen_menu_sync_snapshots" USING btree ("menu_source_id","observed_at");--> statement-breakpoint
CREATE INDEX "canteen_menu_sync_snapshots_equivalent_window_idx" ON "canteen_menu_sync_snapshots" USING btree ("menu_source_id","hkt_weekday","meal_period","observed_minute_of_day");