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
ALTER TABLE "canteen_dish_votes" ADD CONSTRAINT "canteen_dish_votes_menu_item_id_canteen_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."canteen_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_dish_votes" ADD CONSTRAINT "canteen_dish_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_dish_votes_menu_item_id_idx" ON "canteen_dish_votes" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "canteen_dish_votes_user_id_idx" ON "canteen_dish_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "canteen_dish_votes_anon_session_id_idx" ON "canteen_dish_votes" USING btree ("anonymous_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_dish_votes_user_menu_item_uidx" ON "canteen_dish_votes" USING btree ("user_id","menu_item_id") WHERE "canteen_dish_votes"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "canteen_dish_votes_anon_menu_item_uidx" ON "canteen_dish_votes" USING btree ("anonymous_session_id","menu_item_id") WHERE "canteen_dish_votes"."anonymous_session_id" IS NOT NULL;