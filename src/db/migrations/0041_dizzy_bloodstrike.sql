CREATE TABLE "user_hidden_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_rule_key" text NOT NULL,
	"selected_recipe_id" uuid NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_hidden_achievements" ADD CONSTRAINT "user_hidden_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hidden_achievements" ADD CONSTRAINT "user_hidden_achievements_selected_recipe_id_achievement_fusion_recipes_id_fk" FOREIGN KEY ("selected_recipe_id") REFERENCES "public"."achievement_fusion_recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_hidden_achievements_user_source_uq" ON "user_hidden_achievements" USING btree ("user_id","source_rule_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_hidden_achievements_one_equipped_uq" ON "user_hidden_achievements" USING btree ("user_id") WHERE "user_hidden_achievements"."equipped" = true;