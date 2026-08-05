ALTER TABLE "course_rating_professors" DROP CONSTRAINT "course_rating_professors_rating_id_professor_id_pk";--> statement-breakpoint
ALTER TABLE "course_rating_professors" ALTER COLUMN "professor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "course_rating_professors" ALTER COLUMN "instructor_person_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "course_rating_professors" ADD CONSTRAINT "course_rating_professors_rating_id_instructor_person_id_pk" PRIMARY KEY("rating_id","instructor_person_id");