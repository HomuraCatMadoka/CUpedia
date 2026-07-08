CREATE TABLE "category_courses" (
	"category_id" uuid NOT NULL,
	"course_code" text NOT NULL,
	"missing" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_aliases" (
	"old_code" text PRIMARY KEY NOT NULL,
	"new_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"code" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"title" text NOT NULL,
	"units" numeric NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements_raw" text DEFAULT '' NOT NULL,
	"prerequisite" jsonb,
	"exclusions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "major_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"major_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"units_required" numeric,
	"pick_n" integer
);
--> statement-breakpoint
CREATE TABLE "majors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"faculty" text,
	"total_units" numeric,
	"normative_years" integer DEFAULT 4 NOT NULL,
	"handbook_year" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_courses" ADD CONSTRAINT "category_courses_category_id_major_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."major_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "major_categories" ADD CONSTRAINT "major_categories_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_courses_category_id_idx" ON "category_courses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "courses_subject_idx" ON "courses" USING btree ("subject");--> statement-breakpoint
CREATE INDEX "major_categories_major_id_idx" ON "major_categories" USING btree ("major_id");