CREATE TABLE "canteen_dish_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canteen_dish_comments" ADD CONSTRAINT "canteen_dish_comments_menu_item_id_canteen_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."canteen_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_dish_comments" ADD CONSTRAINT "canteen_dish_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_dish_comments_menu_item_id_idx" ON "canteen_dish_comments" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "canteen_dish_comments_user_id_idx" ON "canteen_dish_comments" USING btree ("user_id");