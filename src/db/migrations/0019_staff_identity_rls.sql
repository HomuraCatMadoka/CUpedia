-- Staff identity data is maintained by offline ingestion and read by the
-- server-side Postgres connection. Do not expose these staging/source tables
-- through the public Data API until an explicit product access policy exists.
ALTER TABLE "staff_people" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_affiliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professor_staff_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_teaching_assignments" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE
      "staff_people",
      "staff_departments",
      "staff_aliases",
      "staff_affiliations",
      "professor_staff_identities",
      "staff_teaching_assignments"
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      "staff_people",
      "staff_departments",
      "staff_aliases",
      "staff_affiliations",
      "professor_staff_identities",
      "staff_teaching_assignments"
    FROM authenticated;
  END IF;
END
$$;
