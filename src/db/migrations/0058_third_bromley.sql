ALTER TABLE "wiki_page_aliases" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "wiki_page_aliases" CASCADE;--> statement-breakpoint
ALTER TABLE "wiki_pages" DROP CONSTRAINT "wiki_pages_slug_unique";--> statement-breakpoint
DROP INDEX "wiki_pages_slug_idx";--> statement-breakpoint
ALTER TABLE "wiki_pages" DROP COLUMN "slug";