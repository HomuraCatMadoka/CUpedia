-- Missing JSON keys yield SQL NULL. Reject unknown shapes explicitly instead
-- of allowing three-valued comparisons or JSONPath regexes to skip them.
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
  day_value jsonb;
  day_count integer;
  distinct_day_count integer;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object'
     OR input->>'timezone' IS DISTINCT FROM 'Asia/Hong_Kong'
     OR jsonb_typeof(input->'intervals') IS DISTINCT FROM 'array'
     OR input - 'timezone' - 'intervals' <> '{}'::jsonb THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(input->'intervals') = 0 THEN
    RETURN false;
  END IF;

  FOR interval_value IN SELECT value FROM jsonb_array_elements(input->'intervals')
  LOOP
    IF jsonb_typeof(interval_value) IS DISTINCT FROM 'object'
       OR jsonb_typeof(interval_value->'days') IS DISTINCT FROM 'array'
       OR jsonb_typeof(interval_value->'opensAt') IS DISTINCT FROM 'string'
       OR jsonb_typeof(interval_value->'closesAt') IS DISTINCT FROM 'string'
       OR interval_value - 'days' - 'opensAt' - 'closesAt' <> '{}'::jsonb THEN
      RETURN false;
    END IF;
    IF jsonb_array_length(interval_value->'days') = 0
       OR interval_value->>'opensAt' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
       OR interval_value->>'closesAt' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
       OR interval_value->>'opensAt' = interval_value->>'closesAt' THEN
      RETURN false;
    END IF;
    FOR day_value IN SELECT value FROM jsonb_array_elements(interval_value->'days')
    LOOP
      IF (day_value IN ('"mon"'::jsonb, '"tue"'::jsonb, '"wed"'::jsonb,
          '"thu"'::jsonb, '"fri"'::jsonb, '"sat"'::jsonb, '"sun"'::jsonb)) IS NOT TRUE THEN
        RETURN false;
      END IF;
    END LOOP;
    SELECT count(*), count(DISTINCT day)
      INTO day_count, distinct_day_count
      FROM jsonb_array_elements(interval_value->'days') AS day;
    IF day_count <> distinct_day_count THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
