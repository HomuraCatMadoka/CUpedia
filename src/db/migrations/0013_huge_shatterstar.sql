CREATE TABLE "course_enrollments" (
	"academic_year" text NOT NULL,
	"term" text NOT NULL,
	"course_code" text NOT NULL,
	"class_code" text NOT NULL,
	"class_nbr" text NOT NULL,
	"component" text NOT NULL,
	"section" text NOT NULL,
	"quota" integer NOT NULL,
	"vacancy" integer NOT NULL,
	"captured_at" timestamp NOT NULL,
	CONSTRAINT "course_enrollments_academic_year_term_class_code_component_section_pk" PRIMARY KEY("academic_year","term","class_code","component","section")
);
--> statement-breakpoint
CREATE TABLE "professor_courses" (
	"professor_id" text NOT NULL,
	"course_code" text NOT NULL,
	CONSTRAINT "professor_courses_professor_id_course_code_pk" PRIMARY KEY("professor_id","course_code")
);
--> statement-breakpoint
CREATE TABLE "professors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"search_text" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN "professor_id" text;--> statement-breakpoint
ALTER TABLE "professor_courses" ADD CONSTRAINT "professor_courses_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_enrollments_course_code_idx" ON "course_enrollments" USING btree ("course_code");--> statement-breakpoint
CREATE INDEX "professors_search_text_idx" ON "professors" USING btree ("search_text");--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE no action ON UPDATE no action;