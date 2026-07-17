CREATE TABLE "achievement_evidence" (
	"achievement_id" uuid NOT NULL,
	"rating_id" uuid NOT NULL,
	"course_code" text NOT NULL,
	CONSTRAINT "achievement_evidence_achievement_id_rating_id_pk" PRIMARY KEY("achievement_id","rating_id")
);
--> statement-breakpoint
CREATE TABLE "achievement_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_key" text NOT NULL,
	"version" integer NOT NULL,
	"category" text DEFAULT 'professional' NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"display_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"badge_code" text NOT NULL,
	"subject_codes" jsonb NOT NULL,
	"required_count" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_rules_version_check" CHECK ("achievement_rules"."version" > 0),
	CONSTRAINT "achievement_rules_badge_code_check" CHECK ("achievement_rules"."badge_code" ~ '^[A-Z]{4}$'),
	CONSTRAINT "achievement_rules_required_count_check" CHECK ("achievement_rules"."required_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"redeemed_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "user_achievements_status_check" CHECK ("user_achievements"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "achievement_evidence" ADD CONSTRAINT "achievement_evidence_achievement_id_user_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."user_achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_evidence" ADD CONSTRAINT "achievement_evidence_rating_id_course_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."course_ratings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD CONSTRAINT "achievement_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_rule_id_achievement_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."achievement_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_evidence_rating_uq" ON "achievement_evidence" USING btree ("rating_id");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_rules_key_version_uq" ON "achievement_rules" USING btree ("rule_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_rules_one_enabled_version_uq" ON "achievement_rules" USING btree ("rule_key") WHERE "achievement_rules"."enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_user_rule_uq" ON "user_achievements" USING btree ("user_id","rule_id");--> statement-breakpoint
CREATE INDEX "user_achievements_user_status_idx" ON "user_achievements" USING btree ("user_id","status");