DO $$
DECLARE
  v_canteen_id constant uuid := 'e5a19754-812c-4a00-ade7-e0e90d46d7cb';
  v_source_id constant uuid := 'f45bda3c-29f9-44f5-807f-7a261ecbff65';
  v_handoff_id constant uuid := '163a06f6-1985-47b6-b86d-6e5dfc07150a';
BEGIN
  IF EXISTS (
    SELECT 1 FROM "canteens"
    WHERE "name" = '敬文書院餐廳' AND "id" <> v_canteen_id
  ) THEN
    RAISE EXCEPTION 'CW_CHU_CANTEEN_IDENTITY_CONFLICT';
  END IF;

  INSERT INTO "canteens" ("id", "name", "location")
  VALUES (v_canteen_id, '敬文書院餐廳', '敬文書院')
  ON CONFLICT ("id") DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM "canteens"
    WHERE "id" = v_canteen_id
      AND "name" = '敬文書院餐廳'
      AND "location" = '敬文書院'
  ) THEN
    RAISE EXCEPTION 'CW_CHU_CANTEEN_FACTS_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "canteen_menu_sources"
    WHERE (
      "canteen_id" = v_canteen_id
      OR (
        "provider" = 'qmai'
        AND "external_owner_id" = '221033'
        AND "external_store_id" = '331725'
      )
    )
      AND "id" <> v_source_id
  ) THEN
    RAISE EXCEPTION 'CW_CHU_QMAI_SOURCE_IDENTITY_CONFLICT';
  END IF;

  INSERT INTO "canteen_menu_sources" (
    "id",
    "canteen_id",
    "provider",
    "external_owner_id",
    "external_store_id",
    "config",
    "closed_weekdays",
    "sync_meal_periods",
    "enabled"
  )
  VALUES (
    v_source_id,
    v_canteen_id,
    'qmai',
    '221033',
    '331725',
    '{"orderType":1,"locale":"zh-HK"}'::jsonb,
    '{}'::integer[],
    ARRAY['breakfast', 'lunch', 'dinner']::text[],
    true
  )
  ON CONFLICT ("id") DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM "canteen_menu_sources"
    WHERE "id" = v_source_id
      AND "canteen_id" = v_canteen_id
      AND "provider" = 'qmai'
      AND "external_owner_id" = '221033'
      AND "external_store_id" = '331725'
      AND "config" = '{"orderType":1,"locale":"zh-HK"}'::jsonb
      AND "closed_weekdays" = '{}'::integer[]
      AND "sync_meal_periods" = ARRAY['breakfast', 'lunch', 'dinner']::text[]
      AND "enabled" = true
  ) THEN
    RAISE EXCEPTION 'CW_CHU_QMAI_SOURCE_FACTS_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "canteen_ordering_handoffs"
    WHERE "canteen_id" = v_canteen_id AND "id" <> v_handoff_id
  ) THEN
    RAISE EXCEPTION 'CW_CHU_ORDERING_HANDOFF_IDENTITY_CONFLICT';
  END IF;

  INSERT INTO "canteen_ordering_handoffs" (
    "id",
    "canteen_id",
    "provider",
    "url",
    "enabled"
  )
  VALUES (
    v_handoff_id,
    v_canteen_id,
    'qmai',
    'https://pth5.qmai.cn/mp-monorepo-h5/web/index.html#pages/takefood/index?store_id=221033&multi_id=331725',
    true
  )
  ON CONFLICT ("id") DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM "canteen_ordering_handoffs"
    WHERE "id" = v_handoff_id
      AND "canteen_id" = v_canteen_id
      AND "provider" = 'qmai'
      AND "url" = 'https://pth5.qmai.cn/mp-monorepo-h5/web/index.html#pages/takefood/index?store_id=221033&multi_id=331725'
      AND "enabled" = true
  ) THEN
    RAISE EXCEPTION 'CW_CHU_ORDERING_HANDOFF_FACTS_CONFLICT';
  END IF;
END $$;
