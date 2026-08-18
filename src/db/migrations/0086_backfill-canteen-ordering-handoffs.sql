-- Custom data migration generated with:
-- pnpm drizzle-kit generate --custom --name backfill-canteen-ordering-handoffs
--
-- Public canteen pages read `canteen_ordering_handoffs`. Only UC 5198/5203
-- were provisioned in 0076, so most venues lost the 「点击点餐」 button after
-- the hardcoded name map was replaced. Menu-source locators already live in
-- the database; this backfill writes the matching official entry URLs.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE "canteen_ordering_handoffs" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "canteen_menu_sources" IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO canteen_ordering_handoffs (
  canteen_id, provider, url, enabled, created_at, updated_at
)
SELECT
  source.canteen_id,
  known.provider,
  known.url,
  true,
  now(),
  now()
FROM canteen_menu_sources source
JOIN (
  VALUES
    ('pinme', '4898', 'https://meal.pin2eat.com/store/4898/takeout'),
    ('pinme', '5198', 'https://meal.pin2eat.com/store/5198/takeout'),
    ('pinme', '5203', 'https://meal.pin2eat.com/store/5203/takeout'),
    ('pinme', '5500', 'https://meal.pin2eat.com/store/5500/takeout'),
    ('pinme', '4899', 'https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=4899#index'),
    ('pinme', '5581', 'https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=5581'),
    ('aigens', '112891', 'https://csd.order.place/home/store/112891?_aigens_source=scan&catMode=false&mode=prekiosk'),
    ('ichef', 'UQftKWxU', 'https://shop.ichefpos.com/store/UQftKWxU/instore/qrcode?tableName=VDE')
) AS known(provider, store_id, url)
  ON source.provider = known.provider
 AND source.external_store_id = known.store_id
ON CONFLICT (canteen_id) DO NOTHING;

INSERT INTO canteen_ordering_handoffs (
  canteen_id, provider, url, enabled, created_at, updated_at
)
SELECT
  source.canteen_id,
  source.provider,
  CASE source.provider
    WHEN 'pinme' THEN
      'https://meal.pin2eat.com/store/' || source.external_store_id || '/takeout'
    WHEN 'aigens' THEN
      'https://csd.order.place/home/store/' || source.external_store_id
      || '?_aigens_source=scan&catMode=false&mode=prekiosk'
    WHEN 'ichef' THEN
      'https://shop.ichefpos.com/store/' || source.external_store_id
      || '/instore/qrcode?tableName=VDE'
    ELSE NULL
  END,
  true,
  now(),
  now()
FROM canteen_menu_sources source
WHERE source.provider IN ('pinme', 'aigens', 'ichef')
  AND NOT EXISTS (
    SELECT 1
    FROM canteen_ordering_handoffs handoff
    WHERE handoff.canteen_id = source.canteen_id
  );
