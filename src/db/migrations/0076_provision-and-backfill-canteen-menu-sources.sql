-- Custom data migration generated with:
-- pnpm drizzle-kit generate --custom --name provision-and-backfill-canteen-menu-sources
-- Drizzle cannot derive audited identity provisioning or in-place legacy-key
-- backfills from schema.ts; ADR 0014 documents this migration boundary.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE "canteen_menu_items" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "canteen_menu_sources" IN SHARE ROW EXCLUSIVE MODE;

-- These namespaces were audited in production before this migration was
-- applied. They came from one-off static menu imports and have no recurring
-- ordering-provider identity. Preserve each menu row and its history as a
-- manual item instead of inventing a provider or deleting/recreating it.
UPDATE canteen_menu_items
SET external_source = NULL,
    external_key = NULL,
    updated_at = now()
WHERE external_source IN (
  'dst-menu',
  'inno330-menu',
  'kebab-menu',
  'msf-menu',
  'pwl-menu',
  'wys-menu',
  '众志堂-menu',
  '珍can-menu',
  '醫院can-menu'
);

-- `order-place:<store-id>` was the public Aigens namespace used by the first
-- menu-sync release. Normalize that audited alias in place before validating
-- the canonical provider locator. The menu row UUID and all referencing
-- votes/comments remain unchanged.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM canteen_menu_items legacy
    JOIN canteen_menu_items canonical
      ON canonical.canteen_id = legacy.canteen_id
     AND canonical.external_source =
       'aigens:' || split_part(legacy.external_source, ':', 2)
     AND canonical.external_key = legacy.external_key
     AND canonical.id <> legacy.id
    WHERE legacy.external_source ~ '^order-place:[^:]+$'
  ) THEN
    RAISE EXCEPTION 'legacy order-place source collides with an existing canonical menu item';
  END IF;
END
$$;

UPDATE canteen_menu_items
SET external_source = 'aigens:' || split_part(external_source, ':', 2),
    updated_at = now()
WHERE external_source ~ '^order-place:[^:]+$';

-- Existing managed rows use rollout shadow identity. Refuse ambiguous source
-- ownership before creating the new source records.
DO $$
DECLARE
  v_unsupported_sources text;
BEGIN
  SELECT string_agg(
    format(
      '%s (%s item/s)',
      regexp_replace(left(source, 120), '[[:cntrl:]]', '?', 'g'),
      item_count
    ),
    ', ' ORDER BY source
  ) INTO v_unsupported_sources
  FROM (
    SELECT external_source AS source, count(*) AS item_count
    FROM canteen_menu_items
    WHERE external_source IS NOT NULL
      AND external_source !~ '^(aigens|ichef|pinme):[^:]+$|^qmai:[^:]+:[^:]+$'
    GROUP BY external_source
    ORDER BY external_source
    LIMIT 10
  ) unsupported;

  IF v_unsupported_sources IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported legacy external source namespace(s): %',
      v_unsupported_sources;
  END IF;

  IF EXISTS (
    SELECT external_source
    FROM canteen_menu_items
    WHERE external_source IS NOT NULL
    GROUP BY external_source
    HAVING count(DISTINCT canteen_id) <> 1
  ) THEN
    RAISE EXCEPTION 'one legacy external source is attached to multiple canteens';
  END IF;

  IF EXISTS (
    SELECT canteen_id
    FROM canteen_menu_items
    WHERE external_source IS NOT NULL
    GROUP BY canteen_id
    HAVING count(DISTINCT external_source) <> 1
  ) THEN
    RAISE EXCEPTION 'one canteen contains multiple legacy external source namespaces';
  END IF;

END
$$;

CREATE TEMP TABLE "_canteen_source_backfill" ON COMMIT DROP AS
SELECT DISTINCT
  item.canteen_id,
  split_part(item.external_source, ':', 1) AS provider,
  CASE
    WHEN item.external_source LIKE 'qmai:%'
      THEN split_part(item.external_source, ':', 3)
    ELSE split_part(item.external_source, ':', 2)
  END AS external_store_id,
  CASE WHEN item.external_source LIKE 'qmai:%'
    THEN split_part(item.external_source, ':', 2)
    ELSE NULL
  END AS external_owner_id,
  item.external_source
FROM canteen_menu_items item
WHERE item.external_source IS NOT NULL;

INSERT INTO canteen_menu_sources (
  canteen_id,
  provider,
  external_owner_id,
  external_store_id,
  config,
  enabled,
  created_at,
  updated_at
)
SELECT canteen_id, provider, external_owner_id, external_store_id, '{}'::jsonb, true, now(), now()
FROM "_canteen_source_backfill"
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_canteen_source_backfill" legacy
    LEFT JOIN canteen_menu_sources source
     ON source.canteen_id = legacy.canteen_id
     AND source.provider = legacy.provider
     AND source.external_owner_id IS NOT DISTINCT FROM legacy.external_owner_id
     AND source.external_store_id = legacy.external_store_id
    WHERE source.id IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy source conflicts with existing source configuration';
  END IF;
END
$$;

CREATE TEMP TABLE "_canteen_menu_identity_backfill" ON COMMIT DROP AS
SELECT
  item.id AS menu_item_id,
  source.id AS menu_source_id,
  CASE
    WHEN item.external_key ~ '^.+#period=(allday|breakfast|lunch|dinner)(\+(allday|breakfast|lunch|dinner))*$'
      THEN regexp_replace(item.external_key, '#period=.*$', '')
    WHEN source.provider = 'aigens'
      AND item.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
      THEN regexp_replace(item.external_key, ':(breakfast|lunch|dinner|allday)$', '')
    WHEN source.provider IN ('aigens', 'ichef', 'pinme', 'qmai')
      AND item.external_key !~ '[:#]'
      THEN item.external_key
    ELSE NULL
  END AS external_product_id
FROM canteen_menu_items item
JOIN "_canteen_source_backfill" legacy
  ON legacy.external_source = item.external_source
 AND legacy.canteen_id = item.canteen_id
JOIN canteen_menu_sources source
 ON source.canteen_id = legacy.canteen_id
 AND source.provider = legacy.provider
 AND source.external_owner_id IS NOT DISTINCT FROM legacy.external_owner_id
 AND source.external_store_id = legacy.external_store_id
WHERE item.external_source IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_canteen_menu_identity_backfill"
    WHERE external_product_id IS NULL OR btrim(external_product_id) = ''
  ) THEN
    RAISE EXCEPTION 'one or more managed menu item identities cannot be safely parsed';
  END IF;

  IF EXISTS (
    SELECT menu_source_id, external_product_id
    FROM "_canteen_menu_identity_backfill"
    GROUP BY menu_source_id, external_product_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'multiple legacy menu rows map to one source product; manual merge required';
  END IF;
END
$$;

UPDATE canteen_menu_items item
SET
  menu_source_id = projection.menu_source_id,
  external_product_id = projection.external_product_id,
  updated_at = now()
FROM "_canteen_menu_identity_backfill" projection
WHERE item.id = projection.menu_item_id;

-- Provision the two UC outlets as separate canteens. Existing provider identity
-- wins; exact legacy names are accepted only when unique. No menu rows are
-- copied or name-matched between 5198 and 5203.
DO $$
DECLARE
  v_5198_canteen_id uuid;
  v_5203_canteen_id uuid;
  v_count integer;
BEGIN
  SELECT canteen_id INTO v_5198_canteen_id
  FROM canteen_menu_sources
  WHERE provider = 'pinme' AND external_store_id = '5198';

  -- Audited from the production canteen page on 2026-08-13. Identity is
  -- deliberately UUID-based: display names are mutable and are not a safe
  -- migration key.
  IF v_5198_canteen_id IS NOT NULL
    AND v_5198_canteen_id <> '8cced094-25b7-439d-8989-ad484ae4b652'
  THEN
    RAISE EXCEPTION 'pinme 5198 is attached to a non-canonical canteen UUID';
  END IF;
  v_5198_canteen_id := '8cced094-25b7-439d-8989-ad484ae4b652';

  IF NOT EXISTS (
    SELECT 1 FROM canteens WHERE id = v_5198_canteen_id
  ) THEN
    IF EXISTS (SELECT 1 FROM canteens) THEN
      RAISE EXCEPTION 'audited production UC 5198 canteen UUID is missing';
    END IF;
    INSERT INTO canteens (id, name, location, created_at, updated_at)
    VALUES (
      v_5198_canteen_id,
      '開心軒（學生飯堂）',
      '聯合書院張祝珊師生康樂中心地下',
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT canteen_id INTO v_5203_canteen_id
  FROM canteen_menu_sources
  WHERE provider = 'pinme' AND external_store_id = '5203';

  IF v_5203_canteen_id IS NULL THEN
    SELECT count(*), min(id::text)::uuid
      INTO v_count, v_5203_canteen_id
    FROM canteens
    WHERE name = '開心軒茶社';
    IF v_count > 1 THEN
      RAISE EXCEPTION 'UC 5203 canteen identity is ambiguous';
    ELSIF v_count = 0 THEN
      v_5203_canteen_id := 'b5203000-0000-4000-a000-000000005203';
      IF EXISTS (
        SELECT 1 FROM canteens
        WHERE id = v_5203_canteen_id AND name <> '開心軒茶社'
      ) THEN
        RAISE EXCEPTION 'reserved UC 5203 canteen ID is occupied';
      END IF;
      INSERT INTO canteens (id, name, location, created_at, updated_at)
      VALUES (
        v_5203_canteen_id,
        '開心軒茶社',
        '聯合書院張祝珊師生康樂中心地下',
        now(),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END IF;

  IF v_5198_canteen_id = v_5203_canteen_id THEN
    RAISE EXCEPTION 'UC 5198 and 5203 must use distinct canteen IDs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM canteens
    WHERE id <> v_5198_canteen_id
      AND name IN ('uc-can', '開心軒（學生飯堂）')
  ) OR EXISTS (
    SELECT 1 FROM canteens
    WHERE id <> v_5203_canteen_id AND name = '開心軒茶社'
  ) THEN
    RAISE EXCEPTION 'duplicate UC canteen identity requires explicit resolution';
  END IF;

  IF EXISTS (
    SELECT 1 FROM canteen_menu_sources
    WHERE canteen_id = v_5198_canteen_id
      AND (provider, external_store_id) <> ('pinme', '5198')
  ) OR EXISTS (
    SELECT 1 FROM canteen_menu_sources
    WHERE canteen_id = v_5203_canteen_id
      AND (provider, external_store_id) <> ('pinme', '5203')
  ) THEN
    RAISE EXCEPTION 'UC canteen already has a different menu source';
  END IF;

  UPDATE canteens SET
    name = '開心軒（學生飯堂）',
    location = '聯合書院張祝珊師生康樂中心地下',
    updated_at = now()
  WHERE id = v_5198_canteen_id;

  UPDATE canteens SET
    name = '開心軒茶社',
    location = '聯合書院張祝珊師生康樂中心地下',
    updated_at = now()
  WHERE id = v_5203_canteen_id;

  INSERT INTO canteen_menu_sources (
    canteen_id, provider, external_store_id, config, enabled, created_at, updated_at
  ) VALUES (
    v_5198_canteen_id, 'pinme', '5198',
    '{"langcode":"zh-Hant","takeout":"1","orderSubType":"1"}',
    NOT EXISTS (
      SELECT 1 FROM canteen_menu_items
      WHERE canteen_id = v_5198_canteen_id AND menu_source_id IS NULL
    ),
    now(), now()
  )
  ON CONFLICT (canteen_id) DO UPDATE SET
    config = excluded.config,
    enabled = NOT EXISTS (
      SELECT 1 FROM canteen_menu_items
      WHERE canteen_id = v_5198_canteen_id AND menu_source_id IS NULL
    ),
    updated_at = now()
  WHERE canteen_menu_sources.provider = 'pinme'
    AND canteen_menu_sources.external_store_id = '5198';

  INSERT INTO canteen_menu_sources (
    canteen_id, provider, external_store_id, config, enabled, created_at, updated_at
  ) VALUES (
    v_5203_canteen_id, 'pinme', '5203',
    '{"langcode":"zh-Hant","takeout":"1","orderSubType":"1"}',
    true, now(), now()
  )
  ON CONFLICT (canteen_id) DO UPDATE SET
    config = excluded.config,
    enabled = true,
    updated_at = now()
  WHERE canteen_menu_sources.provider = 'pinme'
    AND canteen_menu_sources.external_store_id = '5203';

  IF NOT EXISTS (
    SELECT 1 FROM canteen_menu_sources
    WHERE canteen_id = v_5198_canteen_id AND provider = 'pinme' AND external_store_id = '5198'
  ) OR NOT EXISTS (
    SELECT 1 FROM canteen_menu_sources
    WHERE canteen_id = v_5203_canteen_id AND provider = 'pinme' AND external_store_id = '5203'
  ) THEN
    RAISE EXCEPTION 'UC menu source provisioning conflicted with existing data';
  END IF;

  INSERT INTO canteen_ordering_handoffs (
    canteen_id, provider, url, enabled, created_at, updated_at
  ) VALUES
    (v_5198_canteen_id, 'pinme', 'https://meal.pin2eat.com/store/5198/takeout', true, now(), now()),
    (v_5203_canteen_id, 'pinme', 'https://meal.pin2eat.com/store/5203/takeout', true, now(), now())
  ON CONFLICT (canteen_id) DO UPDATE SET
    provider = excluded.provider,
    url = excluded.url,
    enabled = true,
    updated_at = now();

  IF NOT EXISTS (
    SELECT 1 FROM canteen_ordering_handoffs
    WHERE canteen_id = v_5198_canteen_id AND provider = 'pinme'
      AND url = 'https://meal.pin2eat.com/store/5198/takeout'
  ) OR NOT EXISTS (
    SELECT 1 FROM canteen_ordering_handoffs
    WHERE canteen_id = v_5203_canteen_id AND provider = 'pinme'
      AND url = 'https://meal.pin2eat.com/store/5203/takeout'
  ) THEN
    RAISE EXCEPTION 'UC ordering handoff conflicts with existing data';
  END IF;
END
$$;

-- During the expand rollout, old application instances may still write only
-- the shadow identity. Derive the normalized identity before constraints run.
CREATE OR REPLACE FUNCTION canteen_menu_items_fill_normalized_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_provider text;
  v_store_id text;
  v_product_id text;
  v_source_id uuid;
BEGIN
  IF NEW.external_source ~ '^order-place:[^:]+$' THEN
    NEW.external_source :=
      'aigens:' || split_part(NEW.external_source, ':', 2);
  END IF;

  IF NEW.external_source IS NULL OR NEW.menu_source_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_provider := split_part(NEW.external_source, ':', 1);
  v_store_id := CASE
    WHEN v_provider = 'qmai' THEN split_part(NEW.external_source, ':', 3)
    ELSE split_part(NEW.external_source, ':', 2)
  END;
  v_product_id := CASE
    WHEN NEW.external_key ~ '^.+#period=(allday|breakfast|lunch|dinner)(\+(allday|breakfast|lunch|dinner))*$'
      THEN regexp_replace(NEW.external_key, '#period=.*$', '')
    WHEN v_provider = 'aigens'
      AND NEW.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
      THEN regexp_replace(NEW.external_key, ':(breakfast|lunch|dinner|allday)$', '')
    WHEN NEW.external_key !~ '[:#]' THEN NEW.external_key
    ELSE NULL
  END;

  SELECT id INTO v_source_id
  FROM canteen_menu_sources
  WHERE canteen_id = NEW.canteen_id
    AND provider = v_provider
    AND external_owner_id IS NOT DISTINCT FROM CASE
      WHEN v_provider = 'qmai' THEN split_part(NEW.external_source, ':', 2)
      ELSE NULL
    END
    AND external_store_id = v_store_id;

  IF v_source_id IS NULL OR v_product_id IS NULL OR btrim(v_product_id) = '' THEN
    RAISE EXCEPTION 'cannot normalize legacy menu identity for item %', NEW.id;
  END IF;
  NEW.menu_source_id := v_source_id;
  NEW.external_product_id := v_product_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER canteen_menu_items_fill_normalized_identity_trg
BEFORE INSERT OR UPDATE OF external_source, external_key, menu_source_id, external_product_id
ON canteen_menu_items
FOR EACH ROW
EXECUTE FUNCTION canteen_menu_items_fill_normalized_identity();

ALTER TABLE canteen_menu_items
ADD CONSTRAINT canteen_menu_items_rollout_identity_chk
CHECK ((external_source IS NULL) = (menu_source_id IS NULL));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM canteen_menu_items
    WHERE external_source IS NOT NULL
      AND (menu_source_id IS NULL OR external_product_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'managed menu item backfill is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM canteen_menu_items item
    JOIN canteen_menu_sources source ON source.id = item.menu_source_id
    WHERE source.canteen_id <> item.canteen_id
  ) THEN
    RAISE EXCEPTION 'menu source and canteen ownership mismatch';
  END IF;
END
$$;
