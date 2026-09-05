CREATE OR REPLACE FUNCTION public.campus_map_regular_hours_are_valid(input jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
DECLARE
  interval_value jsonb;
  day_count integer;
  distinct_day_count integer;
BEGIN
  IF jsonb_typeof(input) <> 'object'
     OR input->>'timezone' <> 'Asia/Hong_Kong'
     OR jsonb_typeof(input->'intervals') <> 'array'
     OR jsonb_array_length(input->'intervals') = 0
     OR input - 'timezone' - 'intervals' <> '{}'::jsonb
     OR jsonb_path_exists(
       input,
       '$.intervals[*] ? (
         @.type() != "object"
         || !exists(@.days)
         || @.days.type() != "array"
         || @.days.size() == 0
         || exists(@.days[*] ? (
           @ != "mon" && @ != "tue" && @ != "wed" && @ != "thu"
           && @ != "fri" && @ != "sat" && @ != "sun"
         ))
         || !exists(@.opensAt)
         || !(@.opensAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
         || !exists(@.closesAt)
         || !(@.closesAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
         || @.opensAt == @.closesAt
         || exists(@.keyvalue() ? (
           @.key != "days" && @.key != "opensAt" && @.key != "closesAt"
         ))
       )'
     ) THEN
    RETURN false;
  END IF;

  FOR interval_value IN
    SELECT value FROM jsonb_array_elements(input->'intervals')
  LOOP
    SELECT count(*), count(DISTINCT day)
      INTO day_count, distinct_day_count
    FROM jsonb_array_elements_text(interval_value->'days') AS day;
    IF day_count <> distinct_day_count THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.campus_map_official_actions_are_valid(input jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
DECLARE
  action_value jsonb;
  action_label text;
  action_url text;
  action_identity text;
  seen_identities text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(input) <> 'array' OR jsonb_array_length(input) > 8 THEN
    RETURN false;
  END IF;

  FOR action_value IN SELECT value FROM jsonb_array_elements(input)
  LOOP
    IF jsonb_typeof(action_value) <> 'object'
       OR NOT action_value ? 'label'
       OR jsonb_typeof(action_value->'label') <> 'string'
       OR NOT action_value ? 'url'
       OR jsonb_typeof(action_value->'url') <> 'string'
       OR action_value - 'label' - 'url' <> '{}'::jsonb THEN
      RETURN false;
    END IF;

    action_label := action_value->>'label';
    action_url := action_value->>'url';
    IF btrim(action_label) = ''
       OR octet_length(action_label) > 120
       OR action_url <> btrim(action_url)
       OR octet_length(action_url) > 2048
       OR NOT (
         action_url ~* '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([/?#][^[:space:]]*)?$'
         OR action_url ~* '^tel:\+?[0-9][0-9 ()-]{5,24}$'
         OR action_url ~* '^mailto:[^[:space:]@?]+@[^[:space:]@?]+\.[^[:space:]@?]+$'
       ) THEN
      RETURN false;
    END IF;

    action_identity := btrim(action_label) || chr(31) || action_url;
    IF action_identity = ANY(seen_identities) THEN
      RETURN false;
    END IF;
    seen_identities := array_append(seen_identities, action_identity);
  END LOOP;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "campus_map_current_facts"
    WHERE "fact_schema_version" <> 2
  ) THEN
    RAISE EXCEPTION 'Campus Map V2 activation requires an empty V1 Current projection';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" DROP CONSTRAINT "campus_map_current_facts_pin_type_check";--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" DROP CONSTRAINT "campus_map_current_facts_gender_check";--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" DROP CONSTRAINT "campus_map_current_facts_wheelchair_access_check";--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" DROP CONSTRAINT "campus_map_current_facts_temporary_status_check";--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" DROP CONSTRAINT "campus_map_fact_revisions_pin_type_check";--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" DROP CONSTRAINT "campus_map_fact_revisions_gender_check";--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" DROP CONSTRAINT "campus_map_fact_revisions_wheelchair_access_check";--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" DROP CONSTRAINT "campus_map_fact_revisions_temporary_status_check";--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ALTER COLUMN "gender" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ALTER COLUMN "wheelchair_access" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ALTER COLUMN "temporary_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ALTER COLUMN "gender" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ALTER COLUMN "wheelchair_access" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ALTER COLUMN "temporary_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD COLUMN "regular_hours" jsonb;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD COLUMN "official_actions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD COLUMN "visit_note" text;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD COLUMN "regular_hours" jsonb;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD COLUMN "official_actions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD COLUMN "visit_note" text;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_regular_hours_check" CHECK ("campus_map_current_facts"."regular_hours" is null or public.campus_map_regular_hours_are_valid("campus_map_current_facts"."regular_hours"));--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_official_actions_check" CHECK (public.campus_map_official_actions_are_valid("campus_map_current_facts"."official_actions"));--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_visit_note_check" CHECK ("campus_map_current_facts"."visit_note" is null or (
        btrim("campus_map_current_facts"."visit_note") <> '' and octet_length("campus_map_current_facts"."visit_note") <= 500
      ));--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_schema_payload_check" CHECK ("campus_map_current_facts"."fact_schema_version" = 2
    and "campus_map_current_facts"."audience" = 'unknown'
    and "campus_map_current_facts"."credential_requirement" = 'unknown'
    and "campus_map_current_facts"."access_schedule" = '{"kind":"unknown"}'::jsonb
    and "campus_map_current_facts"."reservation_requirement" = 'unknown'
    and ("campus_map_current_facts"."gender" is null or "campus_map_current_facts"."gender" <> 'unknown')
    and ("campus_map_current_facts"."wheelchair_access" is null or "campus_map_current_facts"."wheelchair_access" <> 'unknown')
    and "campus_map_current_facts"."temporary_status" is null
    and ("campus_map_current_facts"."pin_type" = 'printer' or "campus_map_current_facts"."capabilities" = '{}'::text[]) and ("campus_map_current_facts"."pin_type" = 'toilet' or "campus_map_current_facts"."gender" is null));--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_pin_type_check" CHECK ("campus_map_current_facts"."pin_type" in ('toilet', 'water', 'printer', 'common-space', 'classroom', 'sports-facility', 'health-service', 'vending-machine'));--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_gender_check" CHECK ("campus_map_current_facts"."gender" is null or "campus_map_current_facts"."gender" in ('male', 'female', 'all-gender', 'unknown'));--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_wheelchair_access_check" CHECK ("campus_map_current_facts"."wheelchair_access" is null or "campus_map_current_facts"."wheelchair_access" in ('yes', 'limited', 'no', 'unknown'));--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_temporary_status_check" CHECK ("campus_map_current_facts"."temporary_status" is null or "campus_map_current_facts"."temporary_status" in ('normal', 'temporarily-closed', 'unknown'));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_regular_hours_check" CHECK ("campus_map_fact_revisions"."regular_hours" is null or public.campus_map_regular_hours_are_valid("campus_map_fact_revisions"."regular_hours"));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_official_actions_check" CHECK (public.campus_map_official_actions_are_valid("campus_map_fact_revisions"."official_actions"));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_visit_note_check" CHECK ("campus_map_fact_revisions"."visit_note" is null or (
        btrim("campus_map_fact_revisions"."visit_note") <> '' and octet_length("campus_map_fact_revisions"."visit_note") <= 500
      ));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_schema_payload_check" CHECK (("campus_map_fact_revisions"."fact_schema_version" = 1
    and "campus_map_fact_revisions"."pin_type" in ('toilet', 'water', 'printer', 'common-space', 'classroom')
    and "campus_map_fact_revisions"."gender" is not null
    and "campus_map_fact_revisions"."wheelchair_access" is not null
    and "campus_map_fact_revisions"."temporary_status" is not null
    and "campus_map_fact_revisions"."regular_hours" is null
    and "campus_map_fact_revisions"."official_actions" = '[]'::jsonb
    and "campus_map_fact_revisions"."visit_note" is null) or ("campus_map_fact_revisions"."fact_schema_version" = 2
    and "campus_map_fact_revisions"."audience" = 'unknown'
    and "campus_map_fact_revisions"."credential_requirement" = 'unknown'
    and "campus_map_fact_revisions"."access_schedule" = '{"kind":"unknown"}'::jsonb
    and "campus_map_fact_revisions"."reservation_requirement" = 'unknown'
    and ("campus_map_fact_revisions"."gender" is null or "campus_map_fact_revisions"."gender" <> 'unknown')
    and ("campus_map_fact_revisions"."wheelchair_access" is null or "campus_map_fact_revisions"."wheelchair_access" <> 'unknown')
    and "campus_map_fact_revisions"."temporary_status" is null
    and ("campus_map_fact_revisions"."pin_type" = 'printer' or "campus_map_fact_revisions"."capabilities" = '{}'::text[]) and ("campus_map_fact_revisions"."pin_type" = 'toilet' or "campus_map_fact_revisions"."gender" is null)));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_pin_type_check" CHECK ("campus_map_fact_revisions"."pin_type" in ('toilet', 'water', 'printer', 'common-space', 'classroom', 'sports-facility', 'health-service', 'vending-machine'));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_gender_check" CHECK ("campus_map_fact_revisions"."gender" is null or "campus_map_fact_revisions"."gender" in ('male', 'female', 'all-gender', 'unknown'));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_wheelchair_access_check" CHECK ("campus_map_fact_revisions"."wheelchair_access" is null or "campus_map_fact_revisions"."wheelchair_access" in ('yes', 'limited', 'no', 'unknown'));--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_temporary_status_check" CHECK ("campus_map_fact_revisions"."temporary_status" is null or "campus_map_fact_revisions"."temporary_status" in ('normal', 'temporarily-closed', 'unknown'));--> statement-breakpoint
UPDATE "campus_map_fact_schemas"
SET "status" = 'superseded'
WHERE "status" = 'active';--> statement-breakpoint
INSERT INTO "campus_map_fact_schemas" (
  "version",
  "status",
  "definition",
  "display_metadata",
  "created_by"
) VALUES (
  2,
  'active',
  '{"fields":{"name":{"kind":"text"},"placeType":{"kind":"single-select","values":["toilet","water","printer","common-space","classroom","sports-facility","health-service","vending-machine"]},"regularHours":{"kind":"regular-hours","timezone":"Asia/Hong_Kong","localTimePattern":"^(?:[01]\\d|2[0-3]):[0-5]\\d$"},"officialActions":{"kind":"official-actions","maximum":8,"schemes":["https","tel","mailto"]},"visitNote":{"kind":"text"},"capabilities":{"kind":"multi-select","values":["print","scan","copy"]},"gender":{"kind":"single-select","values":["male","female","all-gender"]},"wheelchairAccess":{"kind":"single-select","values":["yes","limited","no"]},"location":{"kind":"location","variants":["building","floor","outdoor-point"],"pointPrecisions":["approximate","precise"],"canonicalCrs":"wgs84"}},"placeTypes":{"toilet":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","gender","wheelchairAccess"],"requiredFields":["name","placeType","location"]},"water":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","wheelchairAccess"],"requiredFields":["name","placeType","location"]},"printer":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","capabilities","wheelchairAccess"],"requiredFields":["name","placeType","location"]},"common-space":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","wheelchairAccess"],"requiredFields":["name","placeType","location"]},"classroom":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","wheelchairAccess"],"requiredFields":["name","placeType","location"]},"sports-facility":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","wheelchairAccess"],"requiredFields":["name","placeType","location"]},"health-service":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","wheelchairAccess"],"requiredFields":["name","placeType","location"]},"vending-machine":{"applicableFields":["name","placeType","regularHours","officialActions","visitNote","location","wheelchairAccess"],"requiredFields":["name","placeType","location"]}}}'::jsonb,
  '{"name":{"label":"名称"},"placeType":{"label":"地点类型"},"regularHours":{"label":"通常开放时间"},"officialActions":{"label":"官方入口"},"visitNote":{"label":"到访提示"},"capabilities":{"label":"服务能力"},"gender":{"label":"性别属性"},"wheelchairAccess":{"label":"无障碍通行"},"location":{"label":"位置"}}'::jsonb,
  NULL
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "campus_map_validate_current_fact_projection"() RETURNS trigger AS $$
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
       NEW.regular_hours,
       NEW.official_actions,
       NEW.visit_note,
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
       source_revision.regular_hours,
       source_revision.official_actions,
       source_revision.visit_note,
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
SET search_path = pg_catalog, public;--> statement-breakpoint
UPDATE "campus_map_current_facts"
SET "revision_id" = "revision_id";
