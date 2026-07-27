CREATE TABLE "course_review_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "course_review_replies" ADD CONSTRAINT "course_review_replies_review_id_course_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."course_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_review_replies" ADD CONSTRAINT "course_review_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_review_replies_review_created_idx" ON "course_review_replies" USING btree ("review_id","created_at");