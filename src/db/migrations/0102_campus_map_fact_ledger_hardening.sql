CREATE FUNCTION "campus_map_reject_ledger_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;
--> statement-breakpoint
CREATE FUNCTION "campus_map_guard_changeset_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(OLD) - 'actor_user_id') = (to_jsonb(NEW) - 'actor_user_id')
     AND NOT EXISTS (
       SELECT 1 FROM public.users WHERE id = OLD.actor_user_id
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;
--> statement-breakpoint
CREATE TRIGGER "campus_map_changesets_immutable_row"
  BEFORE UPDATE OR DELETE ON "campus_map_changesets"
  FOR EACH ROW EXECUTE FUNCTION "campus_map_guard_changeset_mutation"();
--> statement-breakpoint
CREATE TRIGGER "campus_map_changesets_immutable_truncate"
  BEFORE TRUNCATE ON "campus_map_changesets"
  FOR EACH STATEMENT EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "campus_map_place_changes_immutable_row"
  BEFORE UPDATE OR DELETE ON "campus_map_place_changes"
  FOR EACH ROW EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "campus_map_place_changes_immutable_truncate"
  BEFORE TRUNCATE ON "campus_map_place_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "campus_map_fact_revisions_immutable_row"
  BEFORE UPDATE OR DELETE ON "campus_map_fact_revisions"
  FOR EACH ROW EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "campus_map_fact_revisions_immutable_truncate"
  BEFORE TRUNCATE ON "campus_map_fact_revisions"
  FOR EACH STATEMENT EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "campus_map_revision_provenance_immutable_row"
  BEFORE UPDATE OR DELETE ON "campus_map_revision_provenance"
  FOR EACH ROW EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "campus_map_revision_provenance_immutable_truncate"
  BEFORE TRUNCATE ON "campus_map_revision_provenance"
  FOR EACH STATEMENT EXECUTE FUNCTION "campus_map_reject_ledger_mutation"();
--> statement-breakpoint
CREATE FUNCTION "campus_map_validate_current_fact_projection"() RETURNS trigger AS $$
DECLARE
  source_revision record;
BEGIN
  SELECT revision.*, changeset.published_at AS source_published_at
    INTO source_revision
  FROM public.campus_map_fact_revisions revision
  INNER JOIN public.campus_map_changesets changeset
    ON changeset.id = revision.changeset_id
  WHERE revision.id = NEW.revision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current fact references a missing Fact revision'
      USING ERRCODE = '23503';
  END IF;

  IF source_revision.status <> 'active'
     OR ROW(
       NEW.place_id,
       NEW.fact_schema_version,
       NEW.name,
       NEW.building_id,
       NEW.floor_id,
       NEW.pin_type,
       NEW.capabilities,
       NEW.gender,
       NEW.wheelchair_access,
       NEW.audience,
       NEW.credential_requirement,
       NEW.access_schedule,
       NEW.reservation_requirement,
       NEW.temporary_status,
       NEW.location_kind,
       NEW.point_precision,
       NEW.longitude,
       NEW.latitude,
       NEW.coordinate_crs,
       NEW.observed_at,
       NEW.verified_at,
       NEW.verified_by_actor_id_snapshot,
       NEW.published_at
     ) IS DISTINCT FROM ROW(
       source_revision.place_id,
       source_revision.fact_schema_version,
       source_revision.name,
       source_revision.building_id,
       source_revision.floor_id,
       source_revision.pin_type,
       source_revision.capabilities,
       source_revision.gender,
       source_revision.wheelchair_access,
       source_revision.audience,
       source_revision.credential_requirement,
       source_revision.access_schedule,
       source_revision.reservation_requirement,
       source_revision.temporary_status,
       source_revision.location_kind,
       source_revision.point_precision,
       source_revision.longitude,
       source_revision.latitude,
       source_revision.coordinate_crs,
       source_revision.observed_at,
       source_revision.verified_at,
       source_revision.verified_by_actor_id_snapshot,
       source_revision.source_published_at
     ) THEN
    RAISE EXCEPTION 'Current fact does not match Fact revision %', NEW.revision_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;
--> statement-breakpoint
CREATE TRIGGER "campus_map_current_facts_projection_check"
  BEFORE INSERT OR UPDATE ON "campus_map_current_facts"
  FOR EACH ROW EXECUTE FUNCTION "campus_map_validate_current_fact_projection"();
--> statement-breakpoint
UPDATE "campus_map_current_facts"
SET "revision_id" = "revision_id";
