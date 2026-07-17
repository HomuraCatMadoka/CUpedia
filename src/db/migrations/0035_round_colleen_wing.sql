CREATE TABLE "achievement_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"showcase_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"primary_achievement_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievement_profiles" ADD CONSTRAINT "achievement_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_profiles" ADD CONSTRAINT "achievement_profiles_primary_achievement_id_user_achievements_id_fk" FOREIGN KEY ("primary_achievement_id") REFERENCES "public"."user_achievements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_profiles_showcase_id_uq" ON "achievement_profiles" USING btree ("showcase_id");