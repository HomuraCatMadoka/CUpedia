-- Custom migration generated with:
-- pnpm drizzle-kit generate --custom --name repair-legacy-canteen-menu-source-alias
--
-- Production never recorded migration 0076 because its legacy namespace
-- validation failed. This idempotent follow-up converges preview/local
-- databases that may already have recorded 0076 before its compatibility fix.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE "canteen_menu_items" IN SHARE ROW EXCLUSIVE MODE;

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
