ALTER TABLE "course_instructors" ADD COLUMN "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_person_sources" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "staff_person_sources" ADD COLUMN "role_label" text;--> statement-breakpoint
ALTER TABLE "staff_person_sources" ADD COLUMN "appointment_kind" text;--> statement-breakpoint
ALTER TABLE "staff_person_sources" ADD COLUMN "profile_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_public_id_unique" UNIQUE("public_id");--> statement-breakpoint
ALTER TABLE "staff_person_sources" ADD CONSTRAINT "staff_person_sources_appointment_kind_check" CHECK ("staff_person_sources"."appointment_kind" is null or "staff_person_sources"."appointment_kind" in ('regular', 'emeritus', 'visiting', 'part_time', 'adjunct', 'honorary', 'courtesy'));