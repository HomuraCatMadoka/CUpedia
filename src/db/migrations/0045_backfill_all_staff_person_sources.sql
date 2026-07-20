-- Complete provenance for staff rows imported before staff_person_sources was
-- introduced. Preserve the legacy source label instead of guessing that every
-- non-Pure record came from the reviewed department directory.
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
	person."id",
	person."source",
	COALESCE(person."external_id"::text, person."profile_url", person."id"),
	person."profile_url",
	COALESCE(
		person."profile_url",
		affiliation."source_url",
		'urn:cupedia:staff-person:' || md5(person."id")
	),
	person."first_seen_at",
	person."last_seen_at",
	person."is_current",
	person."missing_runs"
FROM "staff_people" person
LEFT JOIN LATERAL (
	SELECT min(existing_affiliation."source_url") AS "source_url"
	FROM "staff_affiliations" existing_affiliation
	WHERE existing_affiliation."person_id" = person."id"
) affiliation ON true
WHERE NOT EXISTS (
	SELECT 1
	FROM "staff_person_sources" existing_source
	WHERE existing_source."person_id" = person."id"
)
ON CONFLICT ("source", "source_key") DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "staff_people" person
		WHERE NOT EXISTS (
			SELECT 1
			FROM "staff_person_sources" person_source
			WHERE person_source."person_id" = person."id"
		)
	) THEN
		RAISE EXCEPTION 'Every staff person must have at least one source';
	END IF;
END
$$;
