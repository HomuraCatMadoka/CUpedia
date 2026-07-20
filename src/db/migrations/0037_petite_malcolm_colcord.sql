CREATE TABLE "achievement_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_key" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_tier" text NOT NULL,
	"display_name" text NOT NULL,
	"seen_at" timestamp,
	"invalidated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_notices_kind_check" CHECK ("achievement_notices"."kind" in ('professional', 'fusion')),
	CONSTRAINT "achievement_notices_tier_check" CHECK ("achievement_notices"."target_tier" in ('bronze', 'silver', 'gold'))
);
--> statement-breakpoint
ALTER TABLE "achievement_notices" ADD CONSTRAINT "achievement_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_notices_user_opportunity_uq" ON "achievement_notices" USING btree ("user_id","opportunity_key");--> statement-breakpoint
CREATE INDEX "achievement_notices_user_current_idx" ON "achievement_notices" USING btree ("user_id","invalidated_at","seen_at");