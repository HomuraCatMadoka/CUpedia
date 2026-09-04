-- The CUHK directory establishes Charles Kuen Kao Building and Ma Lin Building
-- as named buildings in the University Science Centre complex. AMap exposes all
-- three as separate clickable objects. Keep their canonical identities separate;
-- the provider object IDs are only foreign keys into that canonical model.
INSERT INTO "campus_map_provenance_sources" (
  "id", "source_kind", "source_ref", "source_url", "source_owner",
  "source_version", "snapshot_hash", "accessed_on", "rights_status",
  "limitations", "note"
) VALUES (
  '88f0b44f-5cd0-5a79-ac49-4b59a2c9f9f5',
  'official',
  'cuhk-cdo:building-directory:20241111:science-centre-complex',
  'https://www.cuhk.edu.hk/cdo/bldgdir.htm',
  'The Chinese University of Hong Kong Campus Development Office',
  'last-modified:2024-11-11',
  'sha256:70c2a8ed63e584a65bab9469b1339616a18c3db5fdd6f3ff40a8616128b68e91',
  '2026-09-03',
  'unknown',
  'The directory establishes the names in the University Science Centre complex, but does not publish separate building codes, coordinates, or a formal hierarchy.',
  'Charles Kuen Kao Building, R.C. Lee Lecture Hall, and Ma Lin Building are listed beneath H10 University Science Centre.'
) ON CONFLICT ("source_kind", "source_ref") DO NOTHING;
--> statement-breakpoint
INSERT INTO "campus_map_provenance_sources" (
  "id", "source_kind", "source_ref", "source_owner", "source_version",
  "accessed_on", "rights_status", "limitations", "note"
) VALUES
  (
    'e3c3e198-7bad-4dbf-80d7-5a5960b819fd',
    'provider-candidate',
    'amap:poi:B0FFF2MN12:card:2026-09-04',
    'AutoNavi',
    'AMap web map card',
    '2026-09-04',
    'unknown',
    'The provider object ID and label are foreign identity evidence only; they do not define canonical building facts.',
    'Reviewed AMap card B0FFF2MN12 labels Charles Kuen Kao Building as a teaching building.'
  ),
  (
    '93913250-7e8b-48c0-8c52-d9bc697cf021',
    'provider-candidate',
    'amap:poi:B0FFF292L7:card:2026-09-04',
    'AutoNavi',
    'AMap web map card',
    '2026-09-04',
    'unknown',
    'The provider object ID and label are foreign identity evidence only; they do not define canonical building facts.',
    'Reviewed AMap card B0FFF292L7 labels Ma Lin Building as a teaching building.'
  )
ON CONFLICT ("source_kind", "source_ref") DO NOTHING;
--> statement-breakpoint
-- Undo the earlier over-broad alias model if this migration was tested before it
-- was finalized. These are separate buildings, not names for H10.
UPDATE "campus_map_buildings"
SET
  "aliases" = ARRAY(
    SELECT alias
    FROM unnest("campus_map_buildings"."aliases") AS alias
    WHERE alias <> ALL (ARRAY[
      '高锟楼', '高錕樓', 'Charles Kuen Kao Building',
      '铭泽楼', '銘澤樓', 'R.C. Lee Lecture Hall',
      '马临楼', '馬臨樓', 'Ma Lin Building'
    ]::text[])
    ORDER BY alias
  ),
  "updated_at" = greatest(
    "campus_map_buildings"."updated_at",
    '2026-09-04T00:00:00+08:00'::timestamptz
  )
WHERE "id" = 'd0f66212-4138-5ab3-b8e5-04980cf64fb3';
--> statement-breakpoint
INSERT INTO "campus_map_buildings" (
  "id", "name", "english_name", "code", "aliases"
) VALUES
  (
    'b1b8bdb0-e9dc-4b20-af14-6490b31088f2',
    '高锟楼',
    'Charles Kuen Kao Building',
    NULL,
    ARRAY['高錕樓', '科学馆北座高锟楼', '科學館北座高錕樓']::text[]
  ),
  (
    'acdb9ef2-f6ca-43ce-ae18-a06a1f677da5',
    '马临楼',
    'Ma Lin Building',
    NULL,
    ARRAY['馬臨樓', '科学馆南座马临楼', '科學館南座馬臨樓']::text[]
  )
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "campus_map_building_provenance" ("building_id", "provenance_id")
SELECT incoming.building_id, '88f0b44f-5cd0-5a79-ac49-4b59a2c9f9f5'::uuid
FROM unnest(ARRAY[
  'd0f66212-4138-5ab3-b8e5-04980cf64fb3',
  'b1b8bdb0-e9dc-4b20-af14-6490b31088f2',
  'acdb9ef2-f6ca-43ce-ae18-a06a1f677da5'
]::uuid[]) AS incoming(building_id)
JOIN "campus_map_buildings" building
  ON building."id" = incoming.building_id
ON CONFLICT ("building_id", "provenance_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "campus_map_provider_mappings" (
  "provider", "provider_object_id", "target_kind", "building_id",
  "place_id", "provenance_id"
) VALUES
  (
    'amap', 'B0J2RXUQB6', 'building',
    'd0f66212-4138-5ab3-b8e5-04980cf64fb3', NULL,
    '39515576-131d-4440-9fee-0ec2469c7a48'
  ),
  (
    'amap', 'B0FFF2MN12', 'building',
    'b1b8bdb0-e9dc-4b20-af14-6490b31088f2', NULL,
    'e3c3e198-7bad-4dbf-80d7-5a5960b819fd'
  ),
  (
    'amap', 'B0FFF292L7', 'building',
    'acdb9ef2-f6ca-43ce-ae18-a06a1f677da5', NULL,
    '93913250-7e8b-48c0-8c52-d9bc697cf021'
  )
ON CONFLICT ("provider", "provider_object_id") DO NOTHING;
--> statement-breakpoint
-- Seed an auditable bind event for every mapping created above. This migration
-- uses a stable system actor snapshot because no human account owns seed data.
INSERT INTO "campus_map_provider_mapping_events" (
  "provider", "provider_object_id", "command_kind",
  "previous_target_kind", "previous_building_id", "previous_place_id",
  "new_target_kind", "new_building_id", "new_place_id",
  "actor_user_id", "actor_id_snapshot", "actor_nickname_snapshot",
  "reason", "provenance_id"
)
SELECT
  mapping."provider", mapping."provider_object_id", 'bind',
  NULL, NULL, NULL,
  mapping."target_kind", mapping."building_id", mapping."place_id",
  NULL, '00000000-0000-4000-8000-000000000123', 'migration:0123',
  'Seed reviewed AMap hotspot mapping for canonical browse cards.',
  mapping."provenance_id"
FROM "campus_map_provider_mappings" mapping
WHERE mapping."provider" = 'amap'
  AND mapping."provenance_id" IS NOT NULL
  AND mapping."provider_object_id" IN ('B0J2RXUQB6', 'B0FFF2MN12', 'B0FFF292L7')
  AND NOT EXISTS (
    SELECT 1
    FROM "campus_map_provider_mapping_events" event
    WHERE event."provider" = mapping."provider"
      AND event."provider_object_id" = mapping."provider_object_id"
      AND event."command_kind" = 'bind'
      AND event."new_target_kind" = mapping."target_kind"
      AND event."new_building_id" IS NOT DISTINCT FROM mapping."building_id"
      AND event."new_place_id" IS NOT DISTINCT FROM mapping."place_id"
      AND event."actor_id_snapshot" = '00000000-0000-4000-8000-000000000123'
  );
