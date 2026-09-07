DO $$
DECLARE
	floor_label_trim_characters CONSTANT text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "campus_map_floors"
		WHERE btrim("display_label", floor_label_trim_characters) = ''
			OR octet_length(btrim("display_label", floor_label_trim_characters)) > 64
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'Campus Map Floor labels require manual repair before migration',
			HINT = 'Replace blank labels and labels longer than 64 UTF-8 bytes, then retry the migration.';
	END IF;

	-- Floor IDs and Fact revisions are immutable. Do not guess which existing
	-- identity should survive when normalized labels collide.
	IF EXISTS (
		SELECT 1
		FROM "campus_map_floors"
		GROUP BY "building_id", lower(btrim("display_label", floor_label_trim_characters))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'Campus Map normalized Floor labels require manual repair before migration',
			HINT = 'Resolve duplicate Floor identities without rewriting stable IDs or Fact revision history, then retry the migration.';
	END IF;

	UPDATE "campus_map_floors"
	SET "display_label" = btrim("display_label", floor_label_trim_characters)
	WHERE "display_label" <> btrim("display_label", floor_label_trim_characters);
END
$$;
