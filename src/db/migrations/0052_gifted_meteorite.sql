CREATE TABLE "wiki_page_aliases" (
	"slug" text PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_page_aliases" ADD CONSTRAINT "wiki_page_aliases_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_page_aliases_page_id_idx" ON "wiki_page_aliases" USING btree ("page_id");