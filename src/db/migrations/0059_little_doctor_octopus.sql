CREATE TABLE "wiki_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"icon" text,
	"content" text DEFAULT '' NOT NULL,
	"parent_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_drafts" ADD CONSTRAINT "wiki_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_drafts_created_by_idx" ON "wiki_drafts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "wiki_drafts_parent_id_idx" ON "wiki_drafts" USING btree ("parent_id");