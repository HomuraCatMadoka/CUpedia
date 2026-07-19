CREATE TABLE "course_subjects" (
	"code" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
