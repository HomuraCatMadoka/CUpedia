-- Prices are maintained through authenticated server actions. Keep the table
-- out of Supabase's public Data API until an explicit client policy exists.
ALTER TABLE "canteen_menu_item_prices" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "canteen_menu_item_prices" FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "canteen_menu_item_prices" FROM authenticated;
  END IF;
END
$$;
