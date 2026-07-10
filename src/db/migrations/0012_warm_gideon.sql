CREATE TABLE "danmaku_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "danmaku_messages" ADD CONSTRAINT "danmaku_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "danmaku_messages_month_idx" ON "danmaku_messages" USING btree ("month");--> statement-breakpoint
CREATE INDEX "danmaku_messages_user_id_idx" ON "danmaku_messages" USING btree ("user_id");