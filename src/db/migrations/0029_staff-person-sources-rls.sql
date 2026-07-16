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
