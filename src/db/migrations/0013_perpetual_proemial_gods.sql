CREATE TABLE "canteen_dish_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteen_dish_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"user_id" uuid,
	"anonymous_session_id" uuid,
	"vote" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canteen_dish_votes_identity_chk" CHECK ((
        ("canteen_dish_votes"."user_id" IS NOT NULL AND "canteen_dish_votes"."anonymous_session_id" IS NULL) OR
        ("canteen_dish_votes"."user_id" IS NULL AND "canteen_dish_votes"."anonymous_session_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "canteen_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer,
	"meal_period" text DEFAULT 'lunch' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"svg_key" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "danmaku_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_import_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"source_image_url" text NOT NULL,
	"ocr_raw_text" text,
	"items" jsonb NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canteen_dish_comments" ADD CONSTRAINT "canteen_dish_comments_menu_item_id_canteen_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."canteen_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_dish_comments" ADD CONSTRAINT "canteen_dish_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_dish_votes" ADD CONSTRAINT "canteen_dish_votes_menu_item_id_canteen_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."canteen_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_dish_votes" ADD CONSTRAINT "canteen_dish_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_menu_items" ADD CONSTRAINT "canteen_menu_items_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "danmaku_messages" ADD CONSTRAINT "danmaku_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_import_drafts" ADD CONSTRAINT "menu_import_drafts_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_dish_comments_menu_item_id_idx" ON "canteen_dish_comments" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "canteen_dish_comments_user_id_idx" ON "canteen_dish_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "canteen_dish_votes_menu_item_id_idx" ON "canteen_dish_votes" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "canteen_dish_votes_user_id_idx" ON "canteen_dish_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "canteen_dish_votes_anon_session_id_idx" ON "canteen_dish_votes" USING btree ("anonymous_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_dish_votes_user_menu_item_uidx" ON "canteen_dish_votes" USING btree ("user_id","menu_item_id") WHERE "canteen_dish_votes"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_dish_votes_anon_menu_item_uidx" ON "canteen_dish_votes" USING btree ("anonymous_session_id","menu_item_id") WHERE "canteen_dish_votes"."anonymous_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "canteen_menu_items_canteen_id_idx" ON "canteen_menu_items" USING btree ("canteen_id");--> statement-breakpoint
CREATE INDEX "canteen_menu_items_canteen_meal_idx" ON "canteen_menu_items" USING btree ("canteen_id","meal_period");--> statement-breakpoint
CREATE INDEX "danmaku_messages_month_idx" ON "danmaku_messages" USING btree ("month");--> statement-breakpoint
CREATE INDEX "danmaku_messages_user_id_idx" ON "danmaku_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "menu_import_drafts_canteen_id_idx" ON "menu_import_drafts" USING btree ("canteen_id");