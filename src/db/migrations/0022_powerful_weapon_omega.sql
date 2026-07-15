ALTER TABLE "staff_affiliation_titles" ADD COLUMN "missing_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_organisation_affiliations" ADD COLUMN "missing_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_organisations" ADD COLUMN "missing_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_people" ADD COLUMN "missing_runs" integer DEFAULT 0 NOT NULL;