ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_rating_range";--> statement-breakpoint
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_difficulty_range";--> statement-breakpoint
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_workload_range";--> statement-breakpoint
ALTER TABLE "course_reviews" DROP CONSTRAINT "course_reviews_grading_range";--> statement-breakpoint
UPDATE "course_reviews"
SET
  "rating" = "rating" * 2,
  "difficulty" = "difficulty" * 2,
  "workload" = "workload" * 2,
  "grading" = "grading" * 2;--> statement-breakpoint
UPDATE "course_aggregates"
SET
  "rating_sum" = "rating_sum" * 2,
  "difficulty_sum" = "difficulty_sum" * 2,
  "workload_sum" = "workload_sum" * 2,
  "grading_sum" = "grading_sum" * 2;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_rating_range" CHECK ("rating" between 1 and 10);--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_difficulty_range" CHECK ("difficulty" between 1 and 10);--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_workload_range" CHECK ("workload" between 1 and 10);--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_grading_range" CHECK ("grading" between 1 and 10);
