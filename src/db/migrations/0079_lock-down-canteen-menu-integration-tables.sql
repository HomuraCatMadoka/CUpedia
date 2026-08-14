-- Custom migration generated with:
-- pnpm drizzle-kit generate --custom --name lock-down-canteen-menu-integration-tables
--
-- These integration/configuration tables are server-only. RLS provides a
-- second boundary if public is exposed through Supabase's Data API, while the
-- explicit revokes keep them out of the API roles entirely.
ALTER TABLE "canteen_menu_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "canteen_ordering_handoffs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "canteen_menu_sources" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "canteen_ordering_handoffs" FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "canteen_menu_sources" FROM anon;
    REVOKE ALL ON TABLE "canteen_ordering_handoffs" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "canteen_menu_sources" FROM authenticated;
    REVOKE ALL ON TABLE "canteen_ordering_handoffs" FROM authenticated;
  END IF;
END
$$;
