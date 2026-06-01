CREATE TABLE "wiki_links" (
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_links" ADD CONSTRAINT "wiki_links_source_id_wiki_pages_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_links" ADD CONSTRAINT "wiki_links_target_id_wiki_pages_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_links_source_id_idx" ON "wiki_links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "wiki_links_target_id_idx" ON "wiki_links" USING btree ("target_id");
