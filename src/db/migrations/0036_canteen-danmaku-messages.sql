CREATE TABLE "canteen_danmaku_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canteen_danmaku_messages" ADD CONSTRAINT "canteen_danmaku_messages_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_danmaku_messages" ADD CONSTRAINT "canteen_danmaku_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_danmaku_messages_canteen_month_idx" ON "canteen_danmaku_messages" USING btree ("canteen_id","month");--> statement-breakpoint
CREATE INDEX "canteen_danmaku_messages_user_id_idx" ON "canteen_danmaku_messages" USING btree ("user_id");