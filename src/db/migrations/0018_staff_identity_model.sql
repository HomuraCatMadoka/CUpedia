CREATE TABLE "professor_staff_identities" (
	"professor_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"match_method" text NOT NULL,
	"source_url" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professor_staff_identities_match_method_check" CHECK ("professor_staff_identities"."match_method" in ('automatic', 'manual_override'))
);
--> statement-breakpoint
CREATE TABLE "staff_affiliations" (
	"person_id" text NOT NULL,
	"department_id" text NOT NULL,
	"relationship" text NOT NULL,
	"source_url" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_affiliations_person_id_department_id_relationship_pk" PRIMARY KEY("person_id","department_id","relationship")
);
--> statement-breakpoint
CREATE TABLE "staff_aliases" (
	"person_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "staff_aliases_person_id_alias_pk" PRIMARY KEY("person_id","alias")
);
--> statement-breakpoint
CREATE TABLE "staff_departments" (
	"id" text PRIMARY KEY NOT NULL,
	"faculty" text NOT NULL,
	"name" text NOT NULL,
	"profile_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_departments_profile_url_unique" UNIQUE("profile_url")
);
--> statement-breakpoint
CREATE TABLE "staff_people" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"external_id" uuid,
	"profile_url" text,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_people_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "staff_people_profile_url_unique" UNIQUE("profile_url")
);
--> statement-breakpoint
CREATE TABLE "staff_teaching_assignments" (
	"person_id" text NOT NULL,
	"academic_year" text NOT NULL,
	"term" text NOT NULL,
	"course_code" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "staff_teaching_assignments_person_id_academic_year_term_course_code_pk" PRIMARY KEY("person_id","academic_year","term","course_code"),
	CONSTRAINT "staff_teaching_assignments_term_check" CHECK ("staff_teaching_assignments"."term" in ('Term 1', 'Term 2', 'Summer'))
);
--> statement-breakpoint
ALTER TABLE "professor_staff_identities" ADD CONSTRAINT "professor_staff_identities_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_staff_identities" ADD CONSTRAINT "professor_staff_identities_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_affiliations" ADD CONSTRAINT "staff_affiliations_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_affiliations" ADD CONSTRAINT "staff_affiliations_department_id_staff_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."staff_departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_aliases" ADD CONSTRAINT "staff_aliases_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_teaching_assignments" ADD CONSTRAINT "staff_teaching_assignments_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professor_staff_identities_person_id_idx" ON "professor_staff_identities" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "staff_affiliations_department_id_idx" ON "staff_affiliations" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "staff_aliases_normalized_alias_idx" ON "staff_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "staff_people_canonical_name_idx" ON "staff_people" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "staff_teaching_assignments_course_offering_idx" ON "staff_teaching_assignments" USING btree ("course_code","academic_year","term");