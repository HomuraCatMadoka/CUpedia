ALTER TABLE "announcements" ADD COLUMN "withdrawn_at" timestamp;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "notify_on_publish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "announcement_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_announcement_recipient_uq" ON "notifications" USING btree ("announcement_id","recipient_id") WHERE "notifications"."kind" = 'announcement_published';