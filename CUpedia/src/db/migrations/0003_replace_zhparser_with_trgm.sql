DROP TRIGGER IF EXISTS wiki_pages_search_trigger ON wiki_pages;--> statement-breakpoint
DROP FUNCTION IF EXISTS wiki_pages_search_update();--> statement-breakpoint
DROP INDEX IF EXISTS wiki_pages_search_idx;--> statement-breakpoint
ALTER TABLE "wiki_pages" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS wiki_pages_title_trgm_idx ON wiki_pages USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS wiki_pages_content_trgm_idx ON wiki_pages USING gin (content gin_trgm_ops);
