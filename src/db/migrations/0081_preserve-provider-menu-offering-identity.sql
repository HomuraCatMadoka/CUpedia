-- Custom migration generated with:
-- pnpm drizzle-kit generate --custom --name preserve-provider-menu-offering-identity
--
-- Converge databases that already recorded migration 0080. Aigens historically
-- models period-specific offerings (including different prices), while PinMe's
-- legacy period suffix is not part of its stable product identity.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE "canteen_menu_items" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_ambiguous_identities text;
BEGIN
  SELECT string_agg(
    format(
      '%s / %s',
      source.external_store_id,
      regexp_replace(left(item.external_key, 120), '[[:cntrl:]]', '?', 'g')
    ),
    ', ' ORDER BY source.external_store_id, item.external_key
  ) INTO v_ambiguous_identities
  FROM (
    SELECT source.id AS source_id, source.external_store_id, item.external_key
    FROM canteen_menu_items item
    JOIN canteen_menu_sources source ON source.id = item.menu_source_id
    WHERE source.provider = 'aigens'
      AND item.external_key ~ '^.+#period=(allday|breakfast|lunch|dinner)\+(allday|breakfast|lunch|dinner)(\+(allday|breakfast|lunch|dinner))*$'
      AND item.external_key !~ '#offering-period='
    ORDER BY source.external_store_id, item.external_key
    LIMIT 10
  ) item
  JOIN canteen_menu_sources source ON source.id = item.source_id;

  IF v_ambiguous_identities IS NOT NULL THEN
    RAISE EXCEPTION 'ambiguous multi-period Aigens offering identity requires manual resolution: %',
      v_ambiguous_identities;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM canteen_menu_items legacy
    JOIN canteen_menu_sources source ON source.id = legacy.menu_source_id
    JOIN canteen_menu_items canonical
      ON canonical.menu_source_id = legacy.menu_source_id
     AND canonical.external_product_id = CASE
       WHEN legacy.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
         THEN regexp_replace(
           legacy.external_key,
           ':(breakfast|lunch|dinner|allday)$',
           '#offering-period=\1'
         )
       ELSE regexp_replace(
         legacy.external_key,
         '#period=(breakfast|lunch|dinner|allday)$',
         '#offering-period=\1'
       )
     END
     AND canonical.id <> legacy.id
    WHERE source.provider = 'aigens'
      AND (
        legacy.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
        OR (
          legacy.external_key ~ '^.+#period=(breakfast|lunch|dinner|allday)$'
          AND legacy.external_key !~ '#offering-period='
        )
      )
      AND legacy.external_product_id <> legacy.external_key
  ) THEN
    RAISE EXCEPTION 'legacy Aigens offering identity collides with an existing normalized item';
  END IF;
END
$$;

UPDATE canteen_menu_items item
SET external_product_id = CASE
      WHEN item.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
        THEN regexp_replace(
          item.external_key,
          ':(breakfast|lunch|dinner|allday)$',
          '#offering-period=\1'
        )
      ELSE regexp_replace(
        item.external_key,
        '#period=(breakfast|lunch|dinner|allday)$',
        '#offering-period=\1'
      )
    END,
    updated_at = now()
FROM canteen_menu_sources source
WHERE source.id = item.menu_source_id
  AND source.provider = 'aigens'
  AND (
    item.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
    OR (
      item.external_key ~ '^.+#period=(breakfast|lunch|dinner|allday)$'
      AND item.external_key !~ '#offering-period='
    )
  )
  AND item.external_product_id <> item.external_key;

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
    WHEN v_provider = 'aigens'
      AND NEW.external_key ~ '^.+#period=(allday|breakfast|lunch|dinner)$'
      THEN regexp_replace(
        NEW.external_key,
        '#period=(breakfast|lunch|dinner|allday)$',
        '#offering-period=\1'
      )
    WHEN v_provider <> 'aigens'
      AND NEW.external_key ~ '^.+#period=(allday|breakfast|lunch|dinner)(\+(allday|breakfast|lunch|dinner))*$'
      THEN regexp_replace(NEW.external_key, '#period=.*$', '')
    WHEN v_provider = 'pinme'
      AND NEW.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
      THEN regexp_replace(NEW.external_key, ':(breakfast|lunch|dinner|allday)$', '')
    WHEN v_provider = 'aigens'
      AND NEW.external_key ~ '^.+:(breakfast|lunch|dinner|allday)$'
      THEN regexp_replace(
        NEW.external_key,
        ':(breakfast|lunch|dinner|allday)$',
        '#offering-period=\1'
      )
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
