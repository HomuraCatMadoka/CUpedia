-- Known floors, not an assertion of each building's complete floor count.
-- Preserve existing Floor identities and facilities linked to them.
INSERT INTO campus_map_provenance_sources
(source_kind, source_ref, source_url, source_owner, accessed_on, rights_status, limitations)
VALUES
('official', 'cuhk-osa:accessible-toilets-upper:cheng-ming',
 'https://wacc.osa.cuhk.edu.hk/wp-content/uploads/SENS/accessibility-disabled-toilet-upper.pdf',
 'CUHK Office of Student Affairs', '2026-09-08', 'unknown',
 'Lists Cheng Ming Building accessible toilets on G/F through 3/F. Establishes these floors, not a complete floor count.'),
('official', 'cuhk-art-museum:visitor-amenities:floors',
 'https://www.artmuseum.cuhk.edu.hk/en/visit/amenities/',
 'CUHK Art Museum', '2026-09-08', 'unknown',
 'Lists accessible restrooms on Lower Ground Floor and Ground Floor. Does not establish a complete floor count or assign floors to individual wings.')
ON CONFLICT (source_kind, source_ref) DO NOTHING;
--> statement-breakpoint
INSERT INTO campus_map_floors (building_id, display_label, sort_order)
SELECT building.id, incoming.label, incoming.ordinal
FROM (VALUES
 ('631f84c4-9daa-5a40-bafc-886dbb59121a'::uuid, 'G', 0),
 ('631f84c4-9daa-5a40-bafc-886dbb59121a'::uuid, '1', 1),
 ('631f84c4-9daa-5a40-bafc-886dbb59121a'::uuid, '2', 2),
 ('631f84c4-9daa-5a40-bafc-886dbb59121a'::uuid, '3', 3),
 ('41b66763-b2ae-5ede-989e-846e2153bdaa'::uuid, 'LG', -1),
 ('41b66763-b2ae-5ede-989e-846e2153bdaa'::uuid, 'G', 0)
) AS incoming(building_id, label, ordinal)
JOIN campus_map_buildings building ON building.id = incoming.building_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO campus_map_floor_provenance (floor_id, provenance_id)
SELECT floor.id, source.id
FROM campus_map_floors floor
JOIN (VALUES
 ('631f84c4-9daa-5a40-bafc-886dbb59121a'::uuid, ARRAY['G','1','2','3'], 'cuhk-osa:accessible-toilets-upper:cheng-ming'),
 ('41b66763-b2ae-5ede-989e-846e2153bdaa'::uuid, ARRAY['LG','G'], 'cuhk-art-museum:visitor-amenities:floors')
) AS incoming(building_id, labels, source_ref)
ON floor.building_id = incoming.building_id AND floor.display_label = ANY(incoming.labels)
JOIN campus_map_provenance_sources source
ON source.source_kind = 'official' AND source.source_ref = incoming.source_ref
ON CONFLICT DO NOTHING;
