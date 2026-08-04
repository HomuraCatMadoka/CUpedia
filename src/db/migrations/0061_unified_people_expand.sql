CREATE TABLE "course_instructors" (
	"person_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_instructors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "professor_staff_identities" DROP CONSTRAINT "professor_staff_identities_match_method_check";--> statement-breakpoint
ALTER TABLE "course_rating_professors" ADD COLUMN "instructor_person_id" text;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN "instructor_person_id" text;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "instructor_person_id" text;--> statement-breakpoint
ALTER TABLE "professor_courses" ADD COLUMN "instructor_person_id" text;--> statement-breakpoint
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_rating_professors" ADD CONSTRAINT "course_rating_professors_instructor_person_id_course_instructors_person_id_fk" FOREIGN KEY ("instructor_person_id") REFERENCES "public"."course_instructors"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_instructor_person_id_course_instructors_person_id_fk" FOREIGN KEY ("instructor_person_id") REFERENCES "public"."course_instructors"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_instructor_person_id_course_instructors_person_id_fk" FOREIGN KEY ("instructor_person_id") REFERENCES "public"."course_instructors"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_courses" ADD CONSTRAINT "professor_courses_instructor_person_id_course_instructors_person_id_fk" FOREIGN KEY ("instructor_person_id") REFERENCES "public"."course_instructors"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_rating_professors_instructor_person_id_idx" ON "course_rating_professors" USING btree ("instructor_person_id");--> statement-breakpoint
CREATE INDEX "course_ratings_instructor_person_id_idx" ON "course_ratings" USING btree ("instructor_person_id");--> statement-breakpoint
CREATE INDEX "course_reviews_instructor_person_id_idx" ON "course_reviews" USING btree ("instructor_person_id");--> statement-breakpoint
CREATE INDEX "professor_courses_instructor_person_id_idx" ON "professor_courses" USING btree ("instructor_person_id");--> statement-breakpoint
ALTER TABLE "professor_staff_identities" ADD CONSTRAINT "professor_staff_identities_match_method_check" CHECK ("professor_staff_identities"."match_method" in ('automatic', 'manual_override', 'source_native'));