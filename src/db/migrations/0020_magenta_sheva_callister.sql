CREATE TABLE "course_offering_instructors" (
	"academic_year" text NOT NULL,
	"term" text NOT NULL,
	"course_code" text NOT NULL,
	"class_code" text NOT NULL,
	"component" text NOT NULL,
	"section" text NOT NULL,
	"instructor_name" text NOT NULL,
	"person_id" text,
	"match_status" text DEFAULT 'unverified' NOT NULL,
	"evidence_url" text,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "course_offering_instructors_academic_year_term_class_code_component_section_instructor_name_pk" PRIMARY KEY("academic_year","term","class_code","component","section","instructor_name"),
	CONSTRAINT "course_offering_instructors_match_status_check" CHECK ("course_offering_instructors"."match_status" in ('automatic', 'manual', 'external', 'unverified'))
);
--> statement-breakpoint
CREATE TABLE "staff_affiliation_titles" (
	"person_id" text NOT NULL,
	"organisation_id" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_affiliation_titles_person_id_organisation_id_title_pk" PRIMARY KEY("person_id","organisation_id","title")
);
--> statement-breakpoint
CREATE TABLE "staff_organisation_affiliations" (
	"person_id" text NOT NULL,
	"organisation_id" text NOT NULL,
	"source_url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_organisation_affiliations_person_id_organisation_id_pk" PRIMARY KEY("person_id","organisation_id")
);
--> statement-breakpoint
CREATE TABLE "staff_organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organisation_type" text NOT NULL,
	"parent_id" text,
	"faculty_id" text,
	"profile_url" text NOT NULL,
	"source" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_organisations_profile_url_unique" UNIQUE("profile_url"),
	CONSTRAINT "staff_organisations_type_check" CHECK ("staff_organisations"."organisation_type" in ('faculty', 'department', 'school', 'unit', 'centre', 'programme', 'institute', 'office', 'laboratory', 'other'))
);
--> statement-breakpoint
ALTER TABLE "staff_people" ADD COLUMN "identity_kind" text DEFAULT 'official' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_people" ADD COLUMN "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_people" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_people" ADD COLUMN "is_current" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "course_offering_instructors" ADD CONSTRAINT "course_offering_instructors_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offering_instructors" ADD CONSTRAINT "course_offering_instructors_enrollment_fk" FOREIGN KEY ("academic_year","term","class_code","component","section") REFERENCES "public"."course_enrollments"("academic_year","term","class_code","component","section") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_affiliation_titles" ADD CONSTRAINT "staff_affiliation_titles_affiliation_fk" FOREIGN KEY ("person_id","organisation_id") REFERENCES "public"."staff_organisation_affiliations"("person_id","organisation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_organisation_affiliations" ADD CONSTRAINT "staff_organisation_affiliations_person_id_staff_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."staff_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_organisation_affiliations" ADD CONSTRAINT "staff_organisation_affiliations_organisation_id_staff_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."staff_organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_organisations" ADD CONSTRAINT "staff_organisations_parent_id_staff_organisations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."staff_organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_organisations" ADD CONSTRAINT "staff_organisations_faculty_id_staff_organisations_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."staff_organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_offering_instructors_course_idx" ON "course_offering_instructors" USING btree ("course_code","academic_year","term");--> statement-breakpoint
CREATE INDEX "course_offering_instructors_person_idx" ON "course_offering_instructors" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "staff_affiliation_titles_org_idx" ON "staff_affiliation_titles" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "staff_organisation_affiliations_org_idx" ON "staff_organisation_affiliations" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "staff_organisations_parent_id_idx" ON "staff_organisations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "staff_organisations_faculty_id_idx" ON "staff_organisations" USING btree ("faculty_id");--> statement-breakpoint
ALTER TABLE "staff_people" ADD CONSTRAINT "staff_people_identity_kind_check" CHECK ("staff_people"."identity_kind" in ('official', 'external', 'unverified'));