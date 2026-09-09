-- Existing user-created floors may have default sort_order = 0.
-- Correct only the verified directory labels, preserving IDs and linked facts.
UPDATE campus_map_floors SET sort_order = CASE display_label
  WHEN 'G' THEN 0 WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3 END
WHERE building_id = '631f84c4-9daa-5a40-bafc-886dbb59121a'
AND display_label IN ('G', '1', '2', '3');
