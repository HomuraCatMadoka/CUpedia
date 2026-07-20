-- This migration was renumbered after the staff branch was rebased. The table
-- may already exist in environments that applied the original branch migration,
-- so the DDL is deliberately idempotent.
CREATE TABLE IF NOT EXISTS "staff_person_sources" (
	"person_id" text NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"profile_url" text,
	"source_url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"missing_runs" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "staff_person_sources_source_source_key_pk" PRIMARY KEY("source","source_key")
);
--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "staff_person_sources" ADD CONSTRAINT "staff_person_sources_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_person_sources_person_id_idx" ON "staff_person_sources" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_person_sources_profile_url_idx" ON "staff_person_sources" USING btree ("profile_url");

-- Preserve lifecycle tracking for Research Portal people that predate the
-- multi-source identity model. Reviewed department records are re-created
-- from their evidence-bearing override payload on the next import.
INSERT INTO "staff_person_sources" (
	"person_id",
	"source",
	"source_key",
	"profile_url",
	"source_url",
	"first_seen_at",
	"last_seen_at",
	"is_current",
	"missing_runs"
)
SELECT
	"id",
	"source",
	COALESCE("external_id"::text, "profile_url"),
	"profile_url",
	"profile_url",
	"first_seen_at",
	"last_seen_at",
	"is_current",
	"missing_runs"
FROM "staff_people"
WHERE "source" = 'cuhk_research_portal'
	AND COALESCE("external_id"::text, "profile_url") IS NOT NULL
	AND "profile_url" IS NOT NULL
ON CONFLICT ("source", "source_key") DO NOTHING;

-- This source/provenance table is maintained by offline ingestion and read by
-- the server-side database connection. Do not expose it through the public
-- Data API until an explicit access policy exists.
ALTER TABLE "staff_person_sources" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "staff_person_sources" FROM anon;
	END IF;

	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "staff_person_sources" FROM authenticated;
	END IF;
END
$$;
