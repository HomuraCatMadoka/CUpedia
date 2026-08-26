-- Migration 0000 predates the removal of zhparser and expects a text-search
-- configuration named public.chinese. The scheduler integration image is the
-- official Supabase PostgreSQL 17 image, so this compatibility-only test
-- configuration lets the complete historical Drizzle chain reach migration
-- 0003, where the application replaces that search path with pg_trgm.
DO $bootstrap$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_ts_config AS config
    JOIN pg_namespace AS namespace ON namespace.oid = config.cfgnamespace
    WHERE namespace.nspname = 'public'
      AND config.cfgname = 'chinese'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION public.chinese
      (COPY = pg_catalog.simple);
  END IF;
END
$bootstrap$;
