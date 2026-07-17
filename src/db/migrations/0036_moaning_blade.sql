CREATE TABLE "achievement_fusion_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_key" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"target_rule_id" uuid NOT NULL,
	"source_rule_keys" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_fusion_recipes_kind_check" CHECK ("achievement_fusion_recipes"."kind" in ('dual_bronze', 'same_profession_gold')),
	CONSTRAINT "achievement_fusion_recipes_version_check" CHECK ("achievement_fusion_recipes"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "achievement_fusion_sources" (
	"fusion_achievement_id" uuid NOT NULL,
	"source_achievement_id" uuid NOT NULL,
	CONSTRAINT "achievement_fusion_sources_fusion_achievement_id_source_achievement_id_pk" PRIMARY KEY("fusion_achievement_id","source_achievement_id")
);
--> statement-breakpoint
ALTER TABLE "achievement_fusion_recipes" ADD CONSTRAINT "achievement_fusion_recipes_target_rule_id_achievement_rules_id_fk" FOREIGN KEY ("target_rule_id") REFERENCES "public"."achievement_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_fusion_recipes" ADD CONSTRAINT "achievement_fusion_recipes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_fusion_sources" ADD CONSTRAINT "achievement_fusion_sources_fusion_achievement_id_user_achievements_id_fk" FOREIGN KEY ("fusion_achievement_id") REFERENCES "public"."user_achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_fusion_sources" ADD CONSTRAINT "achievement_fusion_sources_source_achievement_id_user_achievements_id_fk" FOREIGN KEY ("source_achievement_id") REFERENCES "public"."user_achievements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_fusion_recipes_key_version_uq" ON "achievement_fusion_recipes" USING btree ("recipe_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_fusion_recipes_one_enabled_uq" ON "achievement_fusion_recipes" USING btree ("recipe_key") WHERE "achievement_fusion_recipes"."enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_fusion_sources_source_uq" ON "achievement_fusion_sources" USING btree ("source_achievement_id");