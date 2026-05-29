CREATE TABLE "discussions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"comment_mark_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "discussions_page_id_idx" ON "discussions" USING btree ("page_id");
--> statement-breakpoint
CREATE INDEX "discussions_comment_mark_id_idx" ON "discussions" USING btree ("comment_mark_id");
--> statement-breakpoint
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_parent_id_discussions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;
