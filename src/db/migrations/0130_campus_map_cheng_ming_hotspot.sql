-- Verified by clicking the AMap label in QA on 2026-09-08. The canonical name
-- and NAA alias are independently recorded in CUHK's building/floor directory.
INSERT INTO campus_map_provenance_sources
(source_kind, source_ref, source_owner, source_version, accessed_on, rights_status, limitations, note)
VALUES ('provider-candidate', 'amap:poi:B0FFF0ABIJ:hotspot:2026-09-08', 'AutoNavi',
 'AMap JS API hotspotclick', '2026-09-08', 'unknown',
 'Foreign identity evidence only; provider coordinates do not define canonical building facts.',
 'Clicked the Cheng Ming Building label: providerObjectId B0FFF0ABIJ, name 诚明馆. Matched the existing CUHK building 诚明馆 / 誠明館 / Cheng Ming Building (N1, NAA).')
ON CONFLICT (source_kind, source_ref) DO NOTHING;
--> statement-breakpoint
INSERT INTO campus_map_provider_mappings
(provider, provider_object_id, target_kind, building_id, place_id, provenance_id)
SELECT 'amap', 'B0FFF0ABIJ', 'building', building.id, NULL, source.id
FROM campus_map_buildings building
JOIN campus_map_provenance_sources source
ON source.source_kind = 'provider-candidate'
AND source.source_ref = 'amap:poi:B0FFF0ABIJ:hotspot:2026-09-08'
WHERE building.id = '631f84c4-9daa-5a40-bafc-886dbb59121a'
ON CONFLICT (provider, provider_object_id) DO NOTHING;
