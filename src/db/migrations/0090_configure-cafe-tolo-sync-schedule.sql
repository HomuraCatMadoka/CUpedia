-- Cafe Tolo is open Monday-Saturday from 11:00-19:45 and closed on Sunday.
-- Keep this scheduling fact separate from provider request configuration.
UPDATE "canteen_menu_sources"
SET
  "closed_weekdays" = array[0]::integer[],
  "sync_meal_periods" = array['lunch', 'dinner']::text[],
  "updated_at" = now()
WHERE "provider" = 'pinme'
  AND "external_store_id" = '4899';
