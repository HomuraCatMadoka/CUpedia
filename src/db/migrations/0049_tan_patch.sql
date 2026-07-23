CREATE TABLE "course_rating_professors" (
	"rating_id" uuid NOT NULL,
	"professor_id" text NOT NULL,
	"professor_name_snapshot" text NOT NULL,
	CONSTRAINT "course_rating_professors_rating_id_professor_id_pk" PRIMARY KEY("rating_id","professor_id")
);
--> statement-breakpoint
ALTER TABLE "course_rating_professors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "course_rating_professors" ADD CONSTRAINT "course_rating_professors_rating_id_course_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."course_ratings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_rating_professors" ADD CONSTRAINT "course_rating_professors_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_rating_professors_professor_id_idx" ON "course_rating_professors" USING btree ("professor_id");