-- The app connects as a server-side database role. Keep this role table out of
-- Supabase's public Data API, matching the default-deny policy from 0025.
REVOKE ALL PRIVILEGES ON TABLE "course_instructors" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "course_instructors" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE "course_instructors" FROM authenticated;
  END IF;
END
$$;

-- Preserve timetable-only professors as unverified canonical people. Existing
-- official matches keep their current staff_people identity.
INSERT INTO "staff_people" (
  "id",
  "canonical_name",
  "source",
  "identity_kind"
)
SELECT
  'timetable-professor:' || professor."id",
  professor."name",
  'cuhk_timetable',
  'unverified'
FROM "professors" professor
LEFT JOIN "professor_staff_identities" identity
  ON identity."professor_id" = professor."id"
LEFT JOIN "staff_person_sources" source
  ON source."source" = 'cuhk_timetable'
 AND source."source_key" = professor."id"
WHERE identity."professor_id" IS NULL
  AND source."source_key" IS NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "staff_person_sources" (
  "person_id",
  "source",
  "source_key",
  "source_url"
)
SELECT
  'timetable-professor:' || professor."id",
  'cuhk_timetable',
  professor."id",
  'https://rgsntl.rgs.cuhk.edu.hk/rws_prd_applx2/Public/tt_dsp_timetable.aspx'
FROM "professors" professor
LEFT JOIN "professor_staff_identities" identity
  ON identity."professor_id" = professor."id"
WHERE identity."professor_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "staff_people" person
    WHERE person."id" = 'timetable-professor:' || professor."id"
  )
ON CONFLICT ("source", "source_key") DO UPDATE SET
  "last_seen_at" = now(),
  "is_current" = true,
  "missing_runs" = 0;

INSERT INTO "professor_staff_identities" (
  "professor_id",
  "person_id",
  "match_method",
  "source_url"
)
SELECT
  professor."id",
  source."person_id",
  'source_native',
  source."source_url"
FROM "professors" professor
JOIN "staff_person_sources" source
  ON source."source" = 'cuhk_timetable'
 AND source."source_key" = professor."id"
LEFT JOIN "professor_staff_identities" identity
  ON identity."professor_id" = professor."id"
WHERE identity."professor_id" IS NULL
ON CONFLICT ("professor_id") DO NOTHING;

INSERT INTO "course_instructors" ("person_id")
SELECT DISTINCT identity."person_id"
FROM "professor_staff_identities" identity
ON CONFLICT ("person_id") DO NOTHING;

UPDATE "professor_courses" course
SET "instructor_person_id" = identity."person_id"
FROM "professor_staff_identities" identity
WHERE identity."professor_id" = course."professor_id"
  AND course."instructor_person_id" IS DISTINCT FROM identity."person_id";

UPDATE "course_ratings" rating
SET "instructor_person_id" = identity."person_id"
FROM "professor_staff_identities" identity
WHERE identity."professor_id" = rating."professor_id"
  AND rating."instructor_person_id" IS DISTINCT FROM identity."person_id";

UPDATE "course_rating_professors" selected
SET "instructor_person_id" = identity."person_id"
FROM "professor_staff_identities" identity
WHERE identity."professor_id" = selected."professor_id"
  AND selected."instructor_person_id" IS DISTINCT FROM identity."person_id";

UPDATE "course_reviews" review
SET "instructor_person_id" = identity."person_id"
FROM "professor_staff_identities" identity
WHERE identity."professor_id" = review."professor_id"
  AND review."instructor_person_id" IS DISTINCT FROM identity."person_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "professors" professor
    LEFT JOIN "professor_staff_identities" identity
      ON identity."professor_id" = professor."id"
    WHERE identity."professor_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'unified people backfill left professors without identities';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "professor_courses"
    WHERE "instructor_person_id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "course_ratings"
    WHERE "professor_id" IS NOT NULL AND "instructor_person_id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "course_rating_professors"
    WHERE "instructor_person_id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "course_reviews"
    WHERE "professor_id" IS NOT NULL AND "instructor_person_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'unified people backfill left legacy professor references unmapped';
  END IF;
END
$$;
