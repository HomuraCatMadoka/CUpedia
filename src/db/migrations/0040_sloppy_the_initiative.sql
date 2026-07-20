-- Repair preview databases that applied the PR's former 0037/0038 before
-- main received the same sequence numbers. Drizzle orders migrations by the
-- journal timestamp, so those databases otherwise skip main's older entries
-- while reporting a successful migration.
ALTER TABLE "course_ratings" ADD COLUMN IF NOT EXISTS "workload" text;
--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN IF NOT EXISTS "grade" text;
--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN IF NOT EXISTS "enrollment" text;
--> statement-breakpoint
ALTER TABLE "course_ratings" ADD COLUMN IF NOT EXISTS "attendance" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_workload_check" CHECK ("course_ratings"."workload" is null or "course_ratings"."workload" in ('heavy', 'light'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_grade_check" CHECK ("course_ratings"."grade" is null or "course_ratings"."grade" in ('good', 'bad'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_enrollment_check" CHECK ("course_ratings"."enrollment" is null or "course_ratings"."enrollment" in ('hard', 'easy'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_attendance_check" CHECK ("course_ratings"."attendance" is null or "course_ratings"."attendance" in ('required', 'not_required'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "course_ratings"
SET
	"workload" = CASE
		WHEN "tags" ? 'chur' THEN 'heavy'
		WHEN "tags" ? 'hea' THEN 'light'
		ELSE "workload"
	END,
	"grade" = CASE
		WHEN "tags" ? '靓 grade' THEN 'good'
		WHEN "tags" ? '烂 grade' THEN 'bad'
		ELSE "grade"
	END,
	"enrollment" = CASE
		WHEN "tags" ? '课难抢' THEN 'hard'
		WHEN "tags" ? '点击即送' THEN 'easy'
		ELSE "enrollment"
	END,
	"attendance" = CASE
		WHEN "tags" ? '要 attendance' THEN 'required'
		WHEN "tags" ? '无 attendance' THEN 'not_required'
		ELSE "attendance"
	END,
	"tags" = "tags" - ARRAY[
		'chur',
		'hea',
		'靓 grade',
		'烂 grade',
		'课难抢',
		'点击即送',
		'要 attendance',
		'无 attendance'
	]::text[]
WHERE "tags" ?| ARRAY[
	'chur',
	'hea',
	'靓 grade',
	'烂 grade',
	'课难抢',
	'点击即送',
	'要 attendance',
	'无 attendance'
];
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "achievement_notices" (
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
DO $$ BEGIN
 ALTER TABLE "achievement_notices" ADD CONSTRAINT "achievement_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "achievement_notices_user_opportunity_uq" ON "achievement_notices" USING btree ("user_id","opportunity_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "achievement_notices_user_current_idx" ON "achievement_notices" USING btree ("user_id","invalidated_at","seen_at");
--> statement-breakpoint
ALTER TABLE "achievement_catalogs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "achievement_evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "achievement_fusion_recipes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "achievement_fusion_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "achievement_notices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "achievement_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "achievement_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_achievements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canteen_danmaku_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canteen_danmaku_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canteen_danmaku_messages" ADD CONSTRAINT "canteen_danmaku_messages_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canteen_danmaku_messages" ADD CONSTRAINT "canteen_danmaku_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canteen_danmaku_messages_canteen_month_idx" ON "canteen_danmaku_messages" USING btree ("canteen_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canteen_danmaku_messages_user_id_idx" ON "canteen_danmaku_messages" USING btree ("user_id");
