CREATE TABLE "achievement_catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"source_label" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"programme_count" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	CONSTRAINT "achievement_catalogs_version_check" CHECK ("achievement_catalogs"."version" > 0),
	CONSTRAINT "achievement_catalogs_status_check" CHECK ("achievement_catalogs"."status" in ('active', 'disabled', 'superseded')),
	CONSTRAINT "achievement_catalogs_programme_count_check" CHECK ("achievement_catalogs"."programme_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD COLUMN "catalog_id" uuid;--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD COLUMN "programme_key" text;--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD COLUMN "catalog_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "achievement_catalogs" ADD CONSTRAINT "achievement_catalogs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_catalogs_version_uq" ON "achievement_catalogs" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_catalogs_one_active_uq" ON "achievement_catalogs" USING btree ("status") WHERE "achievement_catalogs"."status" = 'active';--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD CONSTRAINT "achievement_rules_catalog_id_achievement_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."achievement_catalogs"("id") ON DELETE no action ON UPDATE no action;