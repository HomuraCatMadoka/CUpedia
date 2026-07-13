-- Drop the two pg_trgm GIN indexes created in migration 0003. Wiki search runs
-- entirely in memory (searchWikiPages -> getCachedSearchablePages -> Fuse), so
-- neither index has a read path; the content one also sits on a large JSON
-- column, adding write amplification on the soon-to-be-hottest (edit) path. The
-- pg_trgm extension itself stays. Hand-written because these indexes live only
-- in the migration chain, never in schema.ts, so `drizzle-kit generate` cannot
-- see them to emit the DROP. See ADR 0011.
DROP INDEX IF EXISTS wiki_pages_title_trgm_idx;--> statement-breakpoint
DROP INDEX IF EXISTS wiki_pages_content_trgm_idx;
