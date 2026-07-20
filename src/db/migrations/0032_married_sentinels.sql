ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_status_check";--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD COLUMN "subject_groups" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD COLUMN "prerequisite_rule_key" text;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD COLUMN "tier" text DEFAULT 'bronze' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_active_silver_uq" ON "user_achievements" USING btree ("user_id") WHERE "user_achievements"."status" = 'active' and "user_achievements"."tier" = 'silver';--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_active_gold_uq" ON "user_achievements" USING btree ("user_id") WHERE "user_achievements"."status" = 'active' and "user_achievements"."tier" = 'gold';--> statement-breakpoint
ALTER TABLE "achievement_rules" ADD CONSTRAINT "achievement_rules_tier_check" CHECK ("achievement_rules"."tier" in ('bronze', 'silver', 'gold'));--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_tier_check" CHECK ("user_achievements"."tier" in ('bronze', 'silver', 'gold'));--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_status_check" CHECK ("user_achievements"."status" in ('active', 'superseded', 'revoked'));