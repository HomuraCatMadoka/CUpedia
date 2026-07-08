CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"credits" integer,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "course_aggregates" (
	"course_id" uuid PRIMARY KEY NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"difficulty_sum" integer DEFAULT 0 NOT NULL,
	"workload_sum" integer DEFAULT 0 NOT NULL,
	"grading_sum" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"term" text,
	"instructor" text,
	"rating" integer NOT NULL,
	"difficulty" integer NOT NULL,
	"workload" integer NOT NULL,
	"grading" integer NOT NULL,
	"content" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"helpful_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_reviews_rating_range" CHECK ("rating" between 1 and 5),
	CONSTRAINT "course_reviews_difficulty_range" CHECK ("difficulty" between 1 and 5),
	CONSTRAINT "course_reviews_workload_range" CHECK ("workload" between 1 and 5),
	CONSTRAINT "course_reviews_grading_range" CHECK ("grading" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "course_review_votes" (
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_review_votes_pk" PRIMARY KEY("review_id","user_id"),
	CONSTRAINT "course_review_votes_value_range" CHECK ("value" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "course_aggregates" ADD CONSTRAINT "course_aggregates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_review_votes" ADD CONSTRAINT "course_review_votes_review_id_course_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."course_reviews"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_review_votes" ADD CONSTRAINT "course_review_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "courses_code_idx" ON "courses" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "courses_department_idx" ON "courses" USING btree ("department");
--> statement-breakpoint
CREATE INDEX "course_reviews_course_id_idx" ON "course_reviews" USING btree ("course_id");
--> statement-breakpoint
CREATE INDEX "course_reviews_user_id_idx" ON "course_reviews" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "course_reviews_course_user_unique" ON "course_reviews" USING btree ("course_id","user_id");
--> statement-breakpoint
CREATE INDEX "course_review_votes_user_id_idx" ON "course_review_votes" USING btree ("user_id");
