ALTER TABLE "course_ratings" ADD COLUMN "is_anonymous" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "is_anonymous" boolean DEFAULT true NOT NULL;