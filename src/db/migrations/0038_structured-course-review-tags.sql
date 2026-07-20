ALTER TABLE "course_ratings" ADD COLUMN "workload" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN "grade" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN "enrollment" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN "attendance" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_workload_check" CHECK ("course_ratings"."workload" is null or "course_ratings"."workload" in ('heavy', 'light'));--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_grade_check" CHECK ("course_ratings"."grade" is null or "course_ratings"."grade" in ('good', 'bad'));--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_enrollment_check" CHECK ("course_ratings"."enrollment" is null or "course_ratings"."enrollment" in ('hard', 'easy'));--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_attendance_check" CHECK ("course_ratings"."attendance" is null or "course_ratings"."attendance" in ('required', 'not_required'));