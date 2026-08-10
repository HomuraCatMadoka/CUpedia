CREATE TABLE "wiki_page_submission_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"committed_page_override" jsonb,
	"committed_version" integer NOT NULL,
	"committed_content_generation" integer NOT NULL,
	"committed_updated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_page_submission_receipts" ADD CONSTRAINT "wiki_page_submission_receipts_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_submission_receipts" ADD CONSTRAINT "wiki_page_submission_receipts_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_page_submission_receipts_page_id_idx" ON "wiki_page_submission_receipts" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "wiki_page_submission_receipts_submitted_by_idx" ON "wiki_page_submission_receipts" USING btree ("submitted_by");