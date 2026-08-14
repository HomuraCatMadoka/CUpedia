CREATE TABLE "product_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"areas" text[] NOT NULL,
	"published_at" timestamp NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_updates_type_check" CHECK ("product_updates"."type" in ('feature', 'improvement', 'fix', 'adjustment')),
	CONSTRAINT "product_updates_areas_nonempty_check" CHECK (cardinality("product_updates"."areas") > 0),
	CONSTRAINT "product_updates_areas_allowed_check" CHECK ("product_updates"."areas" <@ array['wiki', 'courses', 'canteen', 'map', 'account']::text[])
);
--> statement-breakpoint
ALTER TABLE "product_updates" ADD CONSTRAINT "product_updates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_updates_publication_idx" ON "product_updates" USING btree ("published_at","id");