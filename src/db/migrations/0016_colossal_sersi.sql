ALTER TABLE "course_ratings" ADD COLUMN "academic_year" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN "term" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN "professor_id" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN "professor_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "professor_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "academic_year" text;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "term" text;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "score" real;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_term_check" CHECK ("course_ratings"."term" is null or "course_ratings"."term" in ('Term 1', 'Term 2', 'Summer'));--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_term_check" CHECK ("course_reviews"."term" is null or "course_reviews"."term" in ('Term 1', 'Term 2', 'Summer'));