-- Generated table DDL with reviewed custom Supabase hardening below. RLS and
-- role revokes are not represented by the Drizzle TypeScript schema.
CREATE TABLE "canteen_menu_sync_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_source_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"snapshot_hash" text,
	"item_count" integer,
	"created_count" integer,
	"updated_count" integer,
	"deactivated_count" integer,
	"observation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "canteen_menu_sync_runs_status_chk" CHECK ("canteen_menu_sync_runs"."status" in ('running', 'applied', 'unchanged', 'failed')),
	CONSTRAINT "canteen_menu_sync_runs_counts_chk" CHECK (("canteen_menu_sync_runs"."item_count" is null or "canteen_menu_sync_runs"."item_count" >= 0) and ("canteen_menu_sync_runs"."created_count" is null or "canteen_menu_sync_runs"."created_count" >= 0) and ("canteen_menu_sync_runs"."updated_count" is null or "canteen_menu_sync_runs"."updated_count" >= 0) and ("canteen_menu_sync_runs"."deactivated_count" is null or "canteen_menu_sync_runs"."deactivated_count" >= 0))
);
--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_runs" ADD CONSTRAINT "canteen_menu_sync_runs_menu_source_id_canteen_menu_sources_id_fk" FOREIGN KEY ("menu_source_id") REFERENCES "public"."canteen_menu_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_menu_sync_runs_source_started_idx" ON "canteen_menu_sync_runs" USING btree ("menu_source_id","started_at");--> statement-breakpoint
CREATE INDEX "canteen_menu_sync_runs_status_started_idx" ON "canteen_menu_sync_runs" USING btree ("status","started_at");
--> statement-breakpoint
ALTER TABLE "canteen_menu_sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "canteen_menu_sync_runs" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "canteen_menu_sync_runs" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "canteen_menu_sync_runs" FROM authenticated;
  END IF;
END
$$;
