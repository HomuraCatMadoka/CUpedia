-- These ingestion tables are maintained offline and read by the server-side
-- database connection. Keep them out of the public Data API until the product
-- has an explicit row-level access policy.
ALTER TABLE "staff_organisations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_organisation_affiliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_affiliation_titles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_offering_instructors" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE
      "staff_organisations",
      "staff_organisation_affiliations",
      "staff_affiliation_titles",
      "course_offering_instructors"
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      "staff_organisations",
      "staff_organisation_affiliations",
      "staff_affiliation_titles",
      "course_offering_instructors"
    FROM authenticated;
  END IF;
END
$$;
