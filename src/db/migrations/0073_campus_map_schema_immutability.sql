CREATE OR REPLACE FUNCTION "campus_map_guard_referenced_schema_metadata"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD."definition" IS DISTINCT FROM NEW."definition"
    OR OLD."display_metadata" IS DISTINCT FROM NEW."display_metadata"
  ) AND EXISTS (
    SELECT 1
    FROM "campus_map_fact_revisions"
    WHERE "fact_schema_version" = OLD."version"
  ) THEN
    RAISE EXCEPTION 'referenced Campus Map Fact schema metadata is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "campus_map_fact_schemas_referenced_metadata_immutable"
BEFORE UPDATE OF "definition", "display_metadata"
ON "campus_map_fact_schemas"
FOR EACH ROW
EXECUTE FUNCTION "campus_map_guard_referenced_schema_metadata"();
