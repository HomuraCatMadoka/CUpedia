CREATE TABLE "professor_portrait_assets" (
	"person_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempted_source_fingerprint" text NOT NULL,
	"source_fingerprint" text,
	"materialized_source_url" text,
	"source_etag" text,
	"source_last_modified" text,
	"content_hash" text,
	"webp_256_key" text,
	"webp_384_key" text,
	"width_256" integer,
	"height_256" integer,
	"width_384" integer,
	"height_384" integer,
	"last_attempt_at" timestamp with time zone,
	"materialized_at" timestamp with time zone,
	"error_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professor_portrait_assets_status_check" CHECK ("professor_portrait_assets"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "professor_portrait_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "professor_portrait_assets" ADD CONSTRAINT "professor_portrait_assets_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professor_portrait_assets_status_idx" ON "professor_portrait_assets" USING btree ("status");
